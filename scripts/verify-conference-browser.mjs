#!/usr/bin/env node
// P1a browser evidence: real checked-out shell, synthetic timeline/media only.
// This does not validate the locked decks, real audio sync, Safari or one hour.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, relative, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {selectNativeOptionByKeyboard} from './native-select-keyboard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), dist = resolve(root, 'dist');
const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const out = resolve(root, option('--out', 'build/conference-browser'));
const browser = process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const onlyLayout = args.includes('--layout-only');
const casePrefix = option('--case', null);
const fixturePath = 'tests/fixtures/conference/timeline.synthetic.json';
const fixtureBytes = await readFile(resolve(root, fixturePath));
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.synthetic, true, 'Only the declared synthetic timeline may be served');
const sha = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(accept => setTimeout(accept, ms));
const viewports = [{width:390,height:844},{width:320,height:740},{width:768,height:1024},
  {width:1024,height:768},{width:1440,height:900},{width:1920,height:1080},
  {width:1280,height:900},{width:1023,height:900},{width:767,height:900}];
const report = {schemaVersion:1, kind:'conference-p1a-real-browser', scope:onlyLayout ? 'layout-only' : 'p1a-fixture',
  selectedCasePrefix:casePrefix,
  productionDeployment:false, realDeckMapping:false, physicalDeviceVerification:false,
  startedAt:new Date().toISOString(), sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  workingChanges:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),
  fixture:{file:fixturePath,sha256:sha(fixtureBytes),synthetic:true,audio:'Generated silent 8-bit PCM/8000 Hz WAV, exact declared durations; no clock stubs'},
  cases:[],failures:[],screenshots:[],status:'failed'};

async function sources() {
  const files = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','dist','scripts/verify-conference-browser.mjs','scripts/headless-browser-window.mjs','scripts/native-select-keyboard.mjs','tests/fixtures/conference'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async file => {
    try { return [file,sha(await readFile(resolve(root,file)))]; }
    catch (error) { if(error.code==='ENOENT')return [file,null];throw error; }
  })));
}
class Cdp {
  constructor(ws) {
    this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();
    ws.addEventListener('message',event=>{
      const data=JSON.parse(String(event.data));
      if(!data.id){for(const listener of this.listeners.get(data.method)||[])listener(data.params||{});return;}
      const call=this.pending.get(data.id);if(!call)return;this.pending.delete(data.id);clearTimeout(call.timer);
      data.error?call.reject(new Error(JSON.stringify(data.error))):call.resolve(data.result||{});
    });
  }
  static async connect(url) {const ws=new WebSocket(url);await new Promise((accept,reject)=>{ws.addEventListener('open',accept,{once:true});ws.addEventListener('error',reject,{once:true});});return new Cdp(ws);}
  on(method,listener){this.listeners.set(method,[...(this.listeners.get(method)||[]),listener]);}
  send(method,params={}){return new Promise((accept,reject)=>{const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);this.pending.set(id,{resolve:accept,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('CDP closed'));}this.pending.clear();}
}
async function evaluate(cdp, fn, ...values) {
  const response=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${values.map(value=>JSON.stringify(value)).join(',')})`,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw new Error('Browser evaluation: '+JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function until(read,label,timeout=30000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){try{last=await read();if(last)return last;}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message))throw error;}await delay(80);}throw new Error('Timed out: '+label+'; last='+JSON.stringify(last));}
async function settled(cdp){await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});}
function inspect() {
  const root=document.querySelector('.conference-player');
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const painted=node=>Boolean(node&&!node.closest('[hidden]')&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&rect(node).width>1&&rect(node).height>1);
  const nodes=selector=>[...document.querySelectorAll(selector)];
  const controls=nodes('.conference-player button,.conference-player input,.conference-player select').filter(painted).map(node=>({action:node.dataset.action,role:node.dataset.role,label:node.getAttribute('aria-label')||node.textContent.trim(),disabled:node.disabled,rect:rect(node)}));
  const caption=root?.querySelector('.conference-caption-text'),style=caption?getComputedStyle(caption):null;
  const audio=root?.querySelector('audio'),panel=root?.querySelector('.conference-transcript');
  return {url:location.href,page:document.body.dataset.page,state:root?{...root.dataset}:null,
    viewport:{width:innerWidth,height:innerHeight},horizontalOverflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    h1Count:nodes('h1').length,paintedH1:nodes('h1').filter(painted).length,
    host:rect(document.querySelector('#conference-view')),main:rect(document.querySelector('#main')),visual:rect(root?.querySelector('.conference-visual')),
    player:rect(root),stage:rect(root?.querySelector('.conference-stage')),caption:rect(root?.querySelector('.conference-caption')),
    controlsBox:rect(root?.querySelector('.conference-controls')),play:rect(root?.querySelector('[data-action=play]')),
    captionText:caption?.textContent,captionStyle:style?{height:rect(caption).height,lineHeight:parseFloat(style.lineHeight),lineClamp:style.webkitLineClamp,userSelect:style.userSelect}:null,
    image:{src:root?.querySelector('.conference-slide-image')?.getAttribute('src'),ready:Boolean(root?.querySelector('.conference-slide-image')?.naturalWidth)},
    pageStatus:root?.querySelector('[data-role=page-status]')?.textContent,
    liveCount:nodes('.conference-player [aria-live=polite]').length,
    controls,panel:panel?{open:panel.open,mode:panel.dataset.mode,rect:rect(panel),modal:panel.matches(':modal')}:null,
    audio:audio?{src:audio.currentSrc||audio.src,time:audio.currentTime,duration:audio.duration,paused:audio.paused,readyState:audio.readyState,rate:audio.playbackRate}:null};
}
function navigationState() {
  const documents=[],unavailableFrames=[];
  function visit(doc,visible,depth) {
    documents.push({url:doc.location.href,page:doc.body?.dataset.page,centerTool:doc.body?.dataset.centerTool,
      boot:doc.documentElement?.dataset.boot,visible,depth,players:doc.querySelectorAll('.conference-player').length,
      audio:doc.querySelectorAll('.conference-audio').length});
    for(const frame of doc.querySelectorAll('iframe')) {
      if(!frame.contentDocument){unavailableFrames.push(frame.src);continue;}
      visit(frame.contentDocument,visible&&!frame.hidden&&frame.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),depth+1);
    }
  }
  visit(document,true,0);
  return {root:documents[0],documents,unavailableFrames,players:documents.reduce((sum,item)=>sum+item.players,0),audio:documents.reduce((sum,item)=>sum+item.audio,0),
    overflow:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0)-innerWidth};
}
async function click(cdp,selector) {
  const locate=async block=>{
    await evaluate(cdp,(selector,block)=>{const node=[...document.querySelectorAll(selector)].find(node=>!node.closest('[hidden]')&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&node.getBoundingClientRect().width>0);if(!node)throw Error('Missing visible '+selector);node.scrollIntoView({block,inline:'nearest'});},selector,block);
    await settled(cdp);
    return evaluate(cdp,(selector,alignment)=>{const node=[...document.querySelectorAll(selector)].find(node=>!node.closest('[hidden]')&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&node.getBoundingClientRect().width>0);if(!node)throw Error('Missing visible '+selector);const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,disabled:node.disabled,alignment,hitTarget:Boolean(hit&&node.contains(hit)),hit:hit?{tag:hit.tagName,id:hit.id,className:hit.getAttribute('class')}:null,fixedHeader:Boolean(hit?.closest('.atlas-dashboard-header')&&getComputedStyle(hit.closest('.atlas-dashboard-header')).position==='fixed'),scrollY};},selector,block);
  };
  let box=await locate('nearest');
  // Native select focus may scroll the document. Nearest alignment considers
  // the viewport, but cannot account for the fixed outer header covering it.
  if(!box.hitTarget)box=await locate('center');
  if(!box.hitTarget&&box.fixedHeader&&box.scrollY>0){
    const nativeScroll={from:box.scrollY,deltaY:-box.scrollY};
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:box.x,y:box.y,deltaX:0,deltaY:nativeScroll.deltaY});
    await until(()=>evaluate(cdp,()=>scrollY===0),'native document scroll before '+selector);
    box=await locate('nearest');box.nativeScroll={...nativeScroll,to:box.scrollY};
  }
  assert.equal(Boolean(box.disabled),false,'Disabled control '+selector);
  assert.ok(box.hitTarget,'Native click target is covered: '+selector+' '+JSON.stringify(box));
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});await delay(35);
  return box;
}
async function key(cdp,name,{shift=false,control=false}={}) {
  const keyCodes={ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Home:36,End:35,Tab:9,Enter:13,Escape:27,' ':32,'[':219,']':221};
  const code=name===' '?'Space':name.length===1&&/[a-z]/i.test(name)?'Key'+name.toUpperCase():name==='['?'BracketLeft':name===']'?'BracketRight':name;
  const params={key:name,code,windowsVirtualKeyCode:keyCodes[name]||name.toUpperCase().charCodeAt(0),modifiers:(shift?8:0)|(control?2:0)};
  await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',...params});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',...params});await delay(25);
}
async function focus(cdp,selector){await evaluate(cdp,selector=>{const node=document.querySelector(selector);if(!node)throw Error('Missing '+selector);node.focus({preventScroll:true});},selector);}
async function blur(cdp){await evaluate(cdp,()=>document.activeElement?.blur());}
async function type(cdp,selector,text){await focus(cdp,selector);await key(cdp,'a',{control:true});await cdp.send('Input.insertText',{text});await delay(35);}
async function select(cdp,selector,value,entry){
  // Touch emulation is independent: createPage uses desktop device metrics at
  // every width, so the helper must restore mobile:false on macOS too.
  const viewport={width:entry.width,height:entry.height,mobile:false};
  const receipt={selector,value:String(value),viewport};(entry.nativeSelections??=[]).push(receipt);
  await evaluate(cdp,selector=>{
    const events=[],types=['keydown','keyup','input','change'];
    const observe=event=>{const targetMatches=event.target?.matches?.(selector)||false;if(targetMatches||event.type==='keydown'||event.type==='keyup')events.push({type:event.type,key:event.key??null,isTrusted:event.isTrusted,targetMatches,value:targetMatches?event.target.value:null});};
    for(const type of types)document.addEventListener(type,observe,true);
    window.__conferenceSelectAudit={events,stop(){for(const type of types)document.removeEventListener(type,observe,true);}};
  },selector);
  let selectionError=null;
  try{
    Object.assign(receipt,await selectNativeOptionByKeyboard({cdp,evaluate,context:cdp,settled,selector,value:String(value),viewport}));
    await until(()=>evaluate(cdp,(selector,value)=>document.querySelector(selector)?.value===value,selector,String(value)),'native selection '+value);
  }catch(error){
    selectionError=error;throw error;
  }finally{
    try{receipt.events=await evaluate(cdp,()=>{const audit=window.__conferenceSelectAudit;audit.stop();delete window.__conferenceSelectAudit;return audit.events;});}
    catch(error){if(!selectionError)throw error;receipt.auditError=String(error.stack||error);}
  }
  assert.ok(receipt.events.every(event=>event.isTrusted),'Every native select event is trusted');
  for(const type of ['keydown','keyup'])assert.deepEqual(receipt.events.filter(event=>event.type===type).map(event=>event.key),receipt.keys,'Native select '+type+' sequence');
  assert.ok(receipt.events.filter(event=>event.type==='keydown').every(event=>event.targetMatches),'Native select owns each keydown');
  if(!receipt.noOp)for(const type of ['input','change'])assert.ok(receipt.events.some(event=>event.type===type&&event.targetMatches),'Native select produces trusted '+type);
  return receipt;
}
async function screenshot(cdp,id){const bytes=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64');assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const file=id+'.png';await writeFile(resolve(out,file),bytes);const receipt={file,bytes:bytes.length,sha256:sha(bytes)};report.screenshots.push(receipt);return receipt;}
function assertLayout(state,viewport){
  assert.equal(state.horizontalOverflow,0,'Horizontal page overflow');assert.equal(state.h1Count,1,'One DOM H1');assert.equal(state.paintedH1,1,'One painted H1');
  assert.ok(state.stage.width>1&&state.stage.height>1,'Stage is painted');
  assert.ok(Math.abs(state.stage.width/state.stage.height-16/9)<=.015,'Stage must retain 16:9');
  if(viewport.width>=1280)assert.ok(state.stage.width<=1120.01,'Stage maximum width1120');
  if(viewport.width<=767||viewport.width>=1024&&viewport.width<=1279)assert.ok(Math.abs(state.stage.width-state.visual.width)<=1,'Stage uses the full available width for this A-5 band');
  assert.ok(state.stage.bottom<=state.caption.top+.5,'Caption may not cover the stage');
  assert.ok(state.caption.bottom<=state.controlsBox.top+.5,'Controls may not cover captions');
  assert.ok(state.controlsBox.bottom<=viewport.height+.5,'Controls stay in viewport');
  assert.ok(state.controlsBox.bottom<=state.main.bottom+.5,'Controls may not cover the existing footer');
  assert.ok(Math.abs(state.controlsBox.bottom-state.main.bottom)<=1,'Controls remain anchored to the viewport-owned main region');
  assert.ok(Math.abs((state.play.left+state.play.width/2)-(state.controlsBox.left+state.controlsBox.width/2))<=1,'Primary play centered');
  assert.equal(state.play.width,56,'Primary play width56');assert.equal(state.play.height,56,'Primary play height56');
  const small=state.controls.filter(control=>control.rect.width<43.99||control.rect.height<43.99);assert.deepEqual(small,[],'Every painted control has44px target');
  assert.equal(state.captionStyle.userSelect,'text','Caption remains selectable');assert.equal(state.captionStyle.lineClamp,'2');assert.ok(state.captionStyle.height<=2*state.captionStyle.lineHeight+.5,'Caption bounded to two lines');
  assert.equal(state.liveCount,1,'One polite caption owner');
}

function wav(duration) {const sampleRate=8000,bytes=Math.round(duration*sampleRate),buffer=Buffer.alloc(44+bytes,128);buffer.write('RIFF',0);buffer.writeUInt32LE(36+bytes,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate,28);buffer.writeUInt16LE(1,32);buffer.writeUInt16LE(8,34);buffer.write('data',36);buffer.writeUInt32LE(bytes,40);return buffer;}
const audioFiles=new Map(fixture.audio.map(clip=>['/conference/'+clip.file,wav(clip.durationSec)]));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
let mode='fixture',server,child,browserCdp,profile,stderr='',origin,debugOrigin;
async function createPage(viewport){const context=await browserCdp.send('Target.createBrowserContext');const target=await browserCdp.send('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId});const info=await until(async()=>{const entries=await(await fetch(debugOrigin+'/json/list')).json();return entries.find(item=>item.id===target.targetId);},'new page target');const cdp=await Cdp.connect(info.webSocketDebuggerUrl);await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');const nativeWindow=await verifyHeadlessWindowEnvelope(cdp,viewport);await cdp.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<=1023,maxTouchPoints:1});return {cdp,nativeWindow,dispose:async()=>{cdp.close();await browserCdp.send('Target.disposeBrowserContext',{browserContextId:context.browserContextId});}};}
async function conferenceReady(cdp,state='ready'){
  await until(()=>evaluate(cdp,state=>document.querySelector('.conference-player')?.dataset.state===state,state),'conference '+state);
  await until(()=>evaluate(cdp,()=>document.readyState==='complete'&&document.fonts.status==='loaded'),'document and fonts before measurement');
  if(state==='ready')await until(()=>evaluate(cdp,()=>{const audio=document.querySelector('.conference-audio');return audio?.readyState>=1&&document.querySelector('.conference-slide-image')?.naturalWidth>0;}),'real media metadata/image');
  await settled(cdp);
  let previous='',steady=0,receipt;
  await until(async()=>{
    receipt=await evaluate(cdp,()=>{const play=document.querySelector('.conference-player [data-action=play]'),box=play?.getBoundingClientRect(),hit=box&&document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return {documentState:document.readyState,fonts:document.fonts.status,imageReady:Boolean(document.querySelector('.conference-slide-image')?.naturalWidth),audioReadyState:document.querySelector('.conference-audio')?.readyState,play:box?{left:box.left,top:box.top,width:box.width,height:box.height}:null,playHit:Boolean(play&&hit&&play.contains(hit))};});
    const key=JSON.stringify(receipt.play);steady=key===previous?steady+1:0;previous=key;
    return receipt.documentState==='complete'&&receipt.fonts==='loaded'&&(state!=='ready'||receipt.imageReady&&receipt.audioReadyState>=1)&&receipt.playHit&&steady>=2;
  },'stable conference play target');
  receipt.stableSamples=steady+1;
  return receipt;
}
async function navigate(cdp,query,state='ready'){await cdp.send('Page.navigate',{url:origin+'/bitcoin-cycle-atlas/?page=conference&'+query});return conferenceReady(cdp,state);}
async function playBeforeLeaving(cdp,entry,label){
  await evaluate(cdp,()=>{
    const play=document.querySelector('.conference-player [data-action=play]');
    const record=event=>{window.__conferencePlayClick={isTrusted:event.isTrusted,targetMatches:play.contains(event.target),documentState:document.readyState,fonts:document.fonts.status};};
    play.addEventListener('click',record,{once:true,capture:true});
  });
  await click(cdp,'[data-action=play]');
  entry.playClick=await evaluate(cdp,()=>{const receipt=window.__conferencePlayClick;delete window.__conferencePlayClick;return receipt;});
  assert.equal(entry.playClick?.isTrusted,true,'Native play click is trusted');assert.equal(entry.playClick.targetMatches,true,'Native play click reaches the play button');
  await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='true'&&!document.querySelector('.conference-audio').paused),label);
  entry.playing=await evaluate(cdp,inspect);
}
async function stateTime(cdp){return evaluate(cdp,()=>Number(document.querySelector('.conference-player').dataset.time));}
async function pageSettings(cdp,width,open){if(width<=767){const current=await evaluate(cdp,()=>document.querySelector('[data-action=settings]').getAttribute('aria-expanded')==='true');if(current!==open)await click(cdp,'[data-action=settings]');}}
async function captionFocusReceipt(cdp) {
  const receipt=await evaluate(cdp,()=>{const active=document.activeElement,caption=document.querySelector('.conference-caption');return {captionFocused:active===caption,
    visible:!!active&&!active.closest('[hidden]')&&active.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),panelOpen:document.querySelector('.conference-transcript').open};});
  assert.equal(receipt.panelOpen,false,'Transcript closes');assert.equal(receipt.captionFocused,true,'Hidden opener falls back to the caption');assert.equal(receipt.visible,true,'Restored focus remains visible');return receipt;
}

async function coreInteractions(cdp,entry,viewport){
  await click(cdp,'[data-action=play]');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='true'&&!document.querySelector('audio').paused),'native media play');
  const first=await stateTime(cdp);await until(async()=>await stateTime(cdp)>first+.15,'audio clock advances');await click(cdp,'[data-action=play]');
  await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='false'&&document.querySelector('audio').paused),'native pause');
  let time=await stateTime(cdp);await click(cdp,'[data-action=forward]');assert.ok(Math.abs(await stateTime(cdp)-time-10)<.1,'+10seconds');
  time=await stateTime(cdp);await click(cdp,'[data-action=backward]');assert.ok(Math.abs(await stateTime(cdp)-time+10)<.1,'-10seconds');
  await pageSettings(cdp,viewport.width,true);time=await stateTime(cdp);await select(cdp,'[data-role=deck]','final-290',entry);assert.ok(Math.abs(await stateTime(cdp)-time)<.1,'Deck preserves event time');await select(cdp,'[data-role=deck]','r17-257',entry);
  for(const action of ['follow','auto']){const before=await evaluate(cdp,action=>document.querySelector('.conference-player').dataset[action],action);await click(cdp,'[data-action='+action+']');assert.notEqual(await evaluate(cdp,action=>document.querySelector('.conference-player').dataset[action],action),before);await click(cdp,'[data-action='+action+']');assert.equal(await evaluate(cdp,action=>document.querySelector('.conference-player').dataset[action],action),before);}
  for(const rate of [.75,1,1.25,1.5,2]){await select(cdp,'[data-role=rate]',rate,entry);assert.equal(await evaluate(cdp,()=>document.querySelector('audio').playbackRate),rate);}
  await select(cdp,'[data-role=rate]',1,entry);await pageSettings(cdp,viewport.width,false);
  await click(cdp,'.conference-caption');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-transcript').open),'transcript open');
  const panel=(await evaluate(cdp,inspect)).panel;assert.equal(panel.mode,viewport.width>=1024?'dock':'sheet');if(viewport.width<1024)assert.equal(panel.modal,true);
  assert.ok(panel.rect.left>=-.5&&panel.rect.right<=viewport.width+.5&&panel.rect.bottom<=viewport.height+.5,'Transcript in viewport');
  await type(cdp,'[data-role=transcript-search]','3725초');
  const rows=await evaluate(cdp,()=>[...document.querySelectorAll('.conference-transcript-row')].filter(row=>!row.hidden).map(row=>({index:row.dataset.segment,text:row.textContent})));assert.equal(rows.length,1);assert.ok(rows[0].text.includes('3725초'));
  time=await stateTime(cdp);const deck=await evaluate(cdp,()=>document.querySelector('.conference-player').dataset.deck);await key(cdp,'f');await key(cdp,'d');await key(cdp,'ArrowLeft');assert.ok(Math.abs(await stateTime(cdp)-time)<.1,'Editable keys do not seek');assert.equal(await evaluate(cdp,()=>document.querySelector('.conference-player').dataset.deck),deck,'Editable D does not switch decks');
  await type(cdp,'[data-role=transcript-search]','3725초');await click(cdp,'.conference-transcript-row:not([hidden])');assert.ok(Math.abs(await stateTime(cdp)-3725)<.1,'Transcript row seeks');
  entry.transcript=await evaluate(cdp,inspect);assertLayout(entry.transcript,viewport);entry.transcriptScreenshot=await screenshot(cdp,entry.id+'-transcript');
  entry.transcriptCloseClick=await click(cdp,'[data-action=close-transcript]');assert.equal(await evaluate(cdp,()=>document.activeElement?.classList.contains('conference-caption')),true,'Transcript restores opener focus');
  if(viewport.width<=767){
    await pageSettings(cdp,viewport.width,true);await click(cdp,'.conference-transcript-toggle');
    await until(()=>evaluate(cdp,()=>document.querySelector('.conference-transcript').open&&document.querySelector('.conference-options').hidden),'mobile settings opener becomes hidden');
    await key(cdp,'Escape');entry.mobileSettingsFocusReturn=await captionFocusReceipt(cdp);
  }
  if(viewport.width===1440){
    await click(cdp,'.conference-transcript-toggle');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-transcript').open&&document.querySelector('.conference-transcript').dataset.mode==='dock'),'desktop explicit transcript opener');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await until(()=>evaluate(cdp,()=>{const panel=document.querySelector('.conference-transcript');return panel.open&&panel.dataset.mode==='sheet'&&panel.matches(':modal')&&document.querySelector('.conference-options').hidden;}),'desktop dock becomes a phone sheet');
    await key(cdp,'Escape');entry.resizedFocusReturn=await captionFocusReceipt(cdp);entry.resizedFocusReturn.layout=await evaluate(cdp,inspect);assertLayout(entry.resizedFocusReturn.layout,{width:320,height:740});
    entry.resizedFocusReturn.screenshot=await screenshot(cdp,entry.id+'-resized-focus');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false,maxTouchPoints:1});await delay(100);
  }
  await cdp.send('Page.reload',{ignoreCache:true});await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player')?.dataset.state==='ready'),'reload restored');await until(()=>evaluate(cdp,()=>document.querySelector('audio')?.readyState>=1),'reload metadata');
  const restored=await evaluate(cdp,inspect);assert.equal(restored.state.deck,'r17-257');assert.ok(Math.abs(Number(restored.state.time)-3725)<.1);assert.equal(restored.audio.paused,true,'Reload does not autoplay');entry.reloaded={time:restored.state.time,deck:restored.state.deck,paused:restored.audio.paused};
  entry.nativePlayback=true;entry.speedOptions=[.75,1,1.25,1.5,2];
}
async function keyboardInteractions(cdp,entry){
  await navigate(cdp,'t=0&deck=final-290');await blur(cdp);
  await evaluate(cdp,()=>{window.__conferenceLiveUpdates=[];const live=document.querySelector('.conference-live');window.__conferenceLiveObserver=new MutationObserver(()=>window.__conferenceLiveUpdates.push(live.textContent));window.__conferenceLiveObserver.observe(live,{childList:true,characterData:true,subtree:true});});
  await key(cdp,'ArrowRight');assert.equal(await stateTime(cdp),5);await key(cdp,'ArrowRight');assert.equal(await stateTime(cdp),10);assert.deepEqual(await evaluate(cdp,()=>window.__conferenceLiveUpdates),[],'No duplicate live update inside a segment');
  await key(cdp,'ArrowRight');assert.equal(await stateTime(cdp),15);let updates=await evaluate(cdp,()=>window.__conferenceLiveUpdates);assert.equal(updates.length,1,'One live DOM update at a segment boundary');assert.equal(updates[0],fixture.segments[1].text);
  const nullPage=await evaluate(cdp,inspect);assert.equal(nullPage.state.page,'1');assert.match(nullPage.pageStatus,/장표 없음/);entry.nullPage={page:nullPage.state.page,status:nullPage.pageStatus};
  await key(cdp,'ArrowRight',{shift:true});assert.equal(await stateTime(cdp),45);await key(cdp,'ArrowLeft',{shift:true});assert.equal(await stateTime(cdp),15);
  await key(cdp,']');assert.equal(await stateTime(cdp),18);assert.equal((await evaluate(cdp,inspect)).state.page,'2');await key(cdp,'[');assert.equal(await stateTime(cdp),0);
  const follow=(await evaluate(cdp,inspect)).state.follow;await key(cdp,'f');assert.notEqual((await evaluate(cdp,inspect)).state.follow,follow);await key(cdp,'f');assert.equal((await evaluate(cdp,inspect)).state.follow,follow);
  await key(cdp,'d');assert.equal((await evaluate(cdp,inspect)).state.deck,'r17-257');assert.equal(await stateTime(cdp),0);await key(cdp,'d');assert.equal((await evaluate(cdp,inspect)).state.deck,'final-290');
  await key(cdp,' ');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='true'),'Space play');await key(cdp,' ');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='false'),'Space pause');
  await focus(cdp,'[data-action=play]');await key(cdp,'Tab');entry.focusRing=await evaluate(cdp,()=>{const style=getComputedStyle(document.activeElement);return {visible:document.activeElement.matches(':focus-visible'),width:style.outlineWidth,style:style.outlineStyle};});assert.equal(entry.focusRing.visible,true);assert.ok(parseFloat(entry.focusRing.width)>=2);assert.notEqual(entry.focusRing.style,'none');
  entry.captionLiveBoundaryUpdates=updates.length;entry.keyboard=['Space','Left/Right5','Shift+Left/Right30','[',']','F','D'];
}
async function timelineInteractions(cdp,entry){
  await navigate(cdp,'t=18&deck=r17-257');let state=await evaluate(cdp,inspect);assert.equal(state.state.page,'1');assert.match(state.pageStatus,/이 덱에 해당 장표 없음/);assert.equal(state.captionStyle.lineClamp,'2');assert.ok(state.captionStyle.height<=state.captionStyle.lineHeight*2+.5);entry.longCaption=state.captionStyle;
  await click(cdp,'[data-action=next-talk]');assert.equal(await stateTime(cdp),260);await click(cdp,'[data-action=previous-talk]');assert.equal(await stateTime(cdp),0);
  await type(cdp,'[data-role=page]','2');await key(cdp,'Tab');assert.equal(await stateTime(cdp),260,'Page number seeks its first mapped source');
  await click(cdp,'[data-action=zoom]');assert.equal(await evaluate(cdp,()=>document.querySelector('.conference-stage').classList.contains('conference-zoomed')),true);await click(cdp,'[data-action=zoom]');
  await navigate(cdp,'t=3719&deck=final-290');await click(cdp,'[data-action=play]');await until(async()=>await stateTime(cdp)>=3720.15,'real media clip boundary',10000);await click(cdp,'[data-action=play]');state=await evaluate(cdp,inspect);assert.match(state.audio.src,/fixture-2\.wav/);assert.ok(Number(state.state.time)>=3720&&Number(state.state.time)<3724);assert.equal(state.state.page,'3');entry.audioBoundary={time:state.state.time,src:state.audio.src,paused:state.audio.paused};
  await navigate(cdp,'t=17&deck=final-290');await click(cdp,'[data-action=auto]');await click(cdp,'[data-action=play]');await until(async()=>await stateTime(cdp)>=18.15,'automatic slide off at a real segment boundary',10000);await click(cdp,'[data-action=play]');assert.equal((await evaluate(cdp,inspect)).state.page,'1','Automatic slide off holds the current page');await click(cdp,'[data-action=auto]');assert.equal((await evaluate(cdp,inspect)).state.page,'2','Automatic slide on catches up');entry.automaticSlideToggle=true;
  await focus(cdp,'[data-role=timeline]');await key(cdp,'End');assert.equal(await stateTime(cdp),4000,'Event progress reaches the total audio duration');assert.equal((await evaluate(cdp,inspect)).audio.paused,true);await key(cdp,'Home');assert.equal(await stateTime(cdp),0);await key(cdp,'ArrowRight');assert.equal(await stateTime(cdp),.1,'Focused progress uses native range stepping, not the global seek shortcut');
  entry.progress=await evaluate(cdp,()=>({min:document.querySelector('[data-role=timeline]').min,max:document.querySelector('[data-role=timeline]').max,markers:document.querySelectorAll('.conference-marker').length,breakMarkers:document.querySelectorAll('.conference-marker-break').length,total:document.querySelector('[data-role=total-time]').textContent}));assert.equal(entry.progress.min,'0');assert.equal(entry.progress.max,'4000');assert.equal(entry.progress.markers,15);assert.ok(entry.progress.breakMarkers>0);
  await blur(cdp);await click(cdp,'[data-action=next-slide]');assert.equal(await stateTime(cdp),18);await click(cdp,'[data-action=previous-slide]');assert.equal(await stateTime(cdp),0);
  await click(cdp,'.conference-caption');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-transcript').open),'transcript for complete fixture traversal');
  entry.syntheticTraversal={talks:[],decks:[]};
  for(const talk of fixture.talks){await select(cdp,'[data-role=talk-select]',talk.id,entry);assert.equal(await stateTime(cdp),talk.t0);entry.syntheticTraversal.talks.push(talk.id);}
  await click(cdp,'[data-action=close-transcript]');
  for(const deck of fixture.decks){await select(cdp,'[data-role=deck]',deck.id,entry);await click(cdp,'.conference-caption');let lastPage=null;const visited=[];
    for(const [index,segment] of fixture.segments.entries()){await click(cdp,'.conference-transcript-row[data-segment="'+index+'"]');assert.equal(await stateTime(cdp),segment.t0);const current=await evaluate(cdp,inspect);if(Number.isInteger(segment.page?.[deck.id]))lastPage=segment.page[deck.id];assert.equal(current.state.page,lastPage===null?'':String(lastPage));assert.equal(current.captionText,segment.text);assert.equal(await evaluate(cdp,()=>document.querySelectorAll('.conference-transcript-row[aria-current=true]').length),1);visited.push(index);}
    entry.syntheticTraversal.decks.push({deck:deck.id,visitedSegments:visited.length,lastTime:await stateTime(cdp)});await click(cdp,'[data-action=close-transcript]');
  }
}

async function attachDiagnostics(cdp,entry) {
  entry.runtimeErrors=[];entry.resourceErrors=[];entry.expectedMissingData=[];entry.expectedMediaCancellations=[];
  const requests=new Map(),timelineUrl=origin+'/bitcoin-cycle-atlas/conference/timeline.json';
  const expectedMissing=(url,status)=>entry.mode==='empty'&&url===timelineUrl&&status===404;
  cdp.on('Runtime.exceptionThrown',event=>entry.runtimeErrors.push(event.exceptionDetails));
  cdp.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')entry.runtimeErrors.push({consoleError:event.args.map(arg=>arg.value??arg.description??arg.type)});});
  cdp.on('Network.requestWillBeSent',event=>requests.set(event.requestId,{url:event.request.url,type:event.type}));
  cdp.on('Network.responseReceived',event=>{
    if(event.response.status<400)return;
    const issue={url:event.response.url,status:event.response.status,type:event.type};
    if(expectedMissing(issue.url,issue.status))entry.expectedMissingData.push(issue);else entry.resourceErrors.push(issue);
  });
  cdp.on('Network.loadingFailed',event=>{
    const request=requests.get(event.requestId)||{},issue={...request,error:event.errorText,canceled:event.canceled||false};
    const path=request.url?.startsWith(origin+'/')?new URL(request.url).pathname.replace(/^\/bitcoin-cycle-atlas(?=\/)/,''):null;
    // HTMLMediaElement may cancel an old metadata/range request when a user
    // seeks, changes clips or leaves. Only our exact synthetic WAV URLs qualify.
    if(request.type==='Media'&&audioFiles.has(path)&&event.errorText==='net::ERR_ABORTED')entry.expectedMediaCancellations.push(issue);
    else entry.resourceErrors.push(issue);
  });
  cdp.on('Log.entryAdded',event=>{
    const entryLog=event.entry;if(entryLog.level!=='error')return;
    if(expectedMissing(entryLog.url,404)&&entryLog.source==='network'&&/\b404\b/.test(entryLog.text))entry.expectedMissingData.push({url:entryLog.url,text:entryLog.text});
    else entry.resourceErrors.push({source:entryLog.source,url:entryLog.url,text:entryLog.text});
  });
  await cdp.send('Log.enable');
}
async function runCase(spec,run) {
  if(casePrefix&&!spec.id.startsWith(casePrefix))return;
  const entry={...spec,status:'failed',failures:[]};report.cases.push(entry);let page;
  try {
    mode=spec.mode||'fixture';page=await createPage(spec);entry.nativeWindow=page.nativeWindow;
    await attachDiagnostics(page.cdp,entry);await run(page.cdp,entry);
    await until(()=>evaluate(page.cdp,()=>document.readyState==='complete'&&document.fonts.status==='loaded'),'document and fonts settled');
    entry.fonts=await evaluate(page.cdp,()=>({status:document.fonts.status,loaded:[...document.fonts].filter(font=>font.status==='loaded').map(font=>({family:font.family,weight:font.weight}))}));
    assert.deepEqual(entry.runtimeErrors,[],'Unhandled runtime or console errors');
    assert.deepEqual(entry.resourceErrors,[],'Unexpected HTTP/network failures');entry.status='passed';
  } catch(error) {
    entry.failures.push(String(error.stack||error));report.failures.push({id:entry.id,error:entry.failures[0]});
    if(page)try{entry.failedState=await evaluate(page.cdp,inspect);entry.failedScreenshot=await screenshot(page.cdp,entry.id+'-failed');}catch{}
  } finally {
    await page?.dispose();console.log(JSON.stringify({id:entry.id,status:entry.status,failures:entry.failures.map(text=>text.split('\n')[0])}));
    await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
}
try{
  await mkdir(out,{recursive:true});report.sourceHashes=await sources();
  server=createServer(async(req,res)=>{try{const request=new URL(req.url,'http://127.0.0.1');let path=request.pathname.replace(/^\/bitcoin-cycle-atlas(?=\/)/,'');if(path==='/conference/timeline.json'){if(mode==='empty'){res.writeHead(404);res.end('Timeline not published');return;}const data=mode==='invalid'?JSON.stringify({...fixture,segments:[{...fixture.segments[0],page:{'final-290':0,'r17-257':1}},...fixture.segments.slice(1)]}):fixtureBytes;res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(data);return;}if(audioFiles.has(path)){const data=audioFiles.get(path);const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(data.length-1,Number(range[2])):data.length-1;if(start>=data.length||end<start){res.writeHead(416,{'Content-Range':'bytes */'+data.length});res.end();return;}res.writeHead(range?206:200,{'Content-Type':'audio/wav','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store',...(range?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});res.end(req.method==='HEAD'?undefined:data.subarray(start,end+1));return;}const match=/^\/conference\/pages\/(synthetic-[ab])\/(\d{4})\.webp$/.exec(path);if(match){const text=`검증용 장표 ${match[1]} · ${Number(match[2])} / 실제 덱 아님`;res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'});res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#f4f1e9"/><path d="M80 760H1520" stroke="#474747" stroke-width="3"/><text x="80" y="220" font-family="sans-serif" font-size="52" fill="#242424">${text}</text><text x="80" y="310" font-family="sans-serif" font-size="30" fill="#555">P1a 화면·키보드·타임라인 검증 전용</text></svg>`);return;}if(path.endsWith('/'))path+='index.html';const file=await realpath(resolve(dist,'.'+decodeURIComponent(path))),rel=relative(dist,file);assert.ok(rel!=='..'&&!rel.startsWith('..'+sep)&&(await stat(file)).isFile());const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);}catch(error){res.writeHead(404);res.end(String(error.message));}});
  await new Promise(accept=>server.listen(0,'127.0.0.1',accept));origin='http://127.0.0.1:'+server.address().port;report.origin=origin;
  profile=await mkdtemp(resolve(tmpdir(),'atlas-conference-browser-'));child=spawn(browser,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});child.stderr.on('data',bytes=>stderr+=bytes);
  const endpoint=await until(()=>{if(child.exitCode!==null)throw new Error('Chrome exited '+child.exitCode+': '+stderr.slice(-2000));return stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1];},'Chrome CDP');debugOrigin=new URL(endpoint).origin.replace('ws:','http:');browserCdp=await Cdp.connect(endpoint);report.browserVersion=await browserCdp.send('Browser.getVersion');
  for(const viewport of viewports)await runCase({...viewport,id:`fixture-${viewport.width}x${viewport.height}`},async(cdp,entry)=>{const start=Date.now();await navigate(cdp,'t=3725&deck=r17-257');entry.localReadyMs=Date.now()-start;entry.layout=await evaluate(cdp,inspect);entry.screenshot=await screenshot(cdp,entry.id);assertLayout(entry.layout,viewport);assert.equal(entry.layout.state.deck,'r17-257');assert.equal(Number(entry.layout.state.time),3725);assert.equal(entry.layout.state.page,'1');assert.equal(entry.layout.audio.paused,true);assert.ok(Math.abs(entry.layout.audio.time-5)<.1);if(!onlyLayout){await coreInteractions(cdp,entry,viewport);if([320,1440].includes(viewport.width))await keyboardInteractions(cdp,entry);if(viewport.width===1440)await timelineInteractions(cdp,entry);}});
  if(!onlyLayout){
    await runCase({id:'missing-timeline',width:320,height:740,mode:'empty'},async(cdp,entry)=>{await navigate(cdp,'t=3725&deck=r17-257','empty');entry.layout=await evaluate(cdp,inspect);entry.screenshot=await screenshot(cdp,entry.id);assert.equal(entry.layout.horizontalOverflow,0);assert.equal(entry.layout.state.time,'3725');assert.equal(entry.layout.state.deck,'r17-257');assert.equal(entry.layout.audio.paused,true);assert.equal(entry.layout.controls.find(control=>control.action==='play').disabled,true);const text=await evaluate(cdp,()=>document.querySelector('[data-role=state-title]').textContent);assert.match(text,/자료.*준비되지/);});
    await runCase({id:'invalid-timeline',width:768,height:1024,mode:'invalid'},async(cdp,entry)=>{await navigate(cdp,'t=0','error');entry.layout=await evaluate(cdp,inspect);entry.screenshot=await screenshot(cdp,entry.id);assert.equal(entry.layout.horizontalOverflow,0);assert.equal(entry.layout.controls.find(control=>control.action==='play').disabled,true);assert.match(await evaluate(cdp,()=>document.querySelector('[data-role=state-detail]').textContent),/형식/);});
    await runCase({id:'navigation-lifecycle',width:1440,height:900},async(cdp,entry)=>{await navigate(cdp,'t=3725&deck=r17-257');await click(cdp,'[data-action=play]');await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player').dataset.playing==='true'),'play before leaving');const time=await stateTime(cdp);await click(cdp,'[data-atlas-page=outlook]');await until(()=>evaluate(cdp,()=>document.body.dataset.page==='outlook'&&!document.querySelector('.conference-player')),'destroy on chart navigation');await until(()=>evaluate(cdp,()=>document.querySelector('.atlas-plot')?.getBoundingClientRect().width>0),'chart restored');entry.chart=await evaluate(cdp,()=>({page:document.body.dataset.page,h1:document.querySelector('#atlas-page-heading')?.textContent,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,conferenceAudio:document.querySelectorAll('.conference-audio').length}));assert.equal(entry.chart.h1,'가격 차트');assert.equal(entry.chart.overflow,0);assert.equal(entry.chart.conferenceAudio,0);await evaluate(cdp,()=>history.back());await until(()=>evaluate(cdp,()=>document.querySelector('.conference-player')?.dataset.state==='ready'),'back restores conference');await until(()=>evaluate(cdp,()=>document.querySelector('audio')?.readyState>=1),'restored audio metadata');entry.restored=await evaluate(cdp,inspect);assert.equal(entry.restored.state.deck,'r17-257');assert.ok(Math.abs(Number(entry.restored.state.time)-time)<1);assert.equal(entry.restored.audio.paused,true);assert.equal(await evaluate(cdp,()=>document.querySelectorAll('.conference-player').length),1);entry.screenshot=await screenshot(cdp,entry.id);});
    for(const symbol of ['BTCUSD','ETHUSD'])await runCase({id:'navigation-'+symbol,width:1440,height:900},async(cdp,entry)=>{
      await cdp.send('Page.navigate',{url:origin+'/bitcoin-cycle-atlas/?page=outlook&symbol='+symbol});
      await until(()=>evaluate(cdp,()=>document.body?.dataset.page==='outlook'&&document.querySelector('.atlas-plot')?.getBoundingClientRect().width>0),'initial '+symbol+' chart');
      await until(()=>evaluate(cdp,()=>document.documentElement.dataset.boot==='ready'&&[...document.querySelectorAll('[data-atlas-page=conference]')].some(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&node.getBoundingClientRect().width>1)),'hydrated navigation from '+symbol);
      await click(cdp,'[data-atlas-page=conference]');
      await until(()=>evaluate(cdp,()=>document.body?.dataset.page==='conference'&&document.querySelector('.conference-player')?.dataset.state==='ready'),'canonical conference entry from '+symbol);
      // Match direct entry readiness before this post-load navigation lifecycle case.
      // The separate early-load/pageshow playback defect is not repaired here.
      entry.conferenceReadiness=await conferenceReady(cdp);
      entry.conference=await evaluate(cdp,inspect);assert.equal(new URL(entry.conference.url).searchParams.get('page'),'conference');assert.equal(new URL(entry.conference.url).searchParams.has('center'),false,'Conference cannot live in a cached center iframe');
      assert.equal(await evaluate(cdp,()=>document.querySelectorAll('.conference-player').length),1);
      await playBeforeLeaving(cdp,entry,'play before leaving conference');
      const destination=symbol==='BTCUSD'?'evidence':'data';await click(cdp,'[data-atlas-page='+destination+']');
      await until(async()=>{const tree=await evaluate(cdp,navigationState);return tree.root.boot==='ready'&&tree.unavailableFrames.length===0&&tree.players===0&&tree.audio===0&&tree.documents.some(item=>item.visible&&item.page===destination&&item.boot==='ready')&&(tree.root.page===destination||tree.root.centerTool===destination);},'leave conference for '+destination);
      entry.destination=await evaluate(cdp,navigationState);
      if(entry.destination.root.page!==destination)assert.equal(new URL(entry.destination.root.url).searchParams.get('center'),destination,'Preserve the existing center route');
      assert.equal(entry.destination.players,0);assert.equal(entry.destination.audio,0);assert.equal(entry.destination.overflow,0);
      entry.screenshot=await screenshot(cdp,entry.id);
    });
  }
  const after=await sources(),changed=Object.keys({...report.sourceHashes,...after}).filter(file=>report.sourceHashes[file]!==after[file]);report.sourceIntegrity={checkedFiles:Object.keys(after).length,changedSources:changed,unchangedDuringRun:changed.length===0};assert.deepEqual(changed,[],'Sources changed during browser verification');
  assert.ok(report.cases.length>0,'At least one declared browser case must run');if(!casePrefix)assert.equal(report.cases.length,onlyLayout?9:14,'Complete conference browser inventory');
  report.status=report.failures.length?'failed':'passed';
}catch(error){report.failures.push({id:'harness',error:String(error.stack||error)});}
finally{browserCdp?.close();child?.kill('SIGTERM');if(server){server.closeAllConnections();await new Promise(accept=>server.close(accept));}if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(resolve(out,'chrome.stderr.log'),stderr);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.length,passed:report.cases.filter(item=>item.status==='passed').length,failures:report.failures.length,output:out}));process.exitCode=report.status==='passed'?0:1;}
