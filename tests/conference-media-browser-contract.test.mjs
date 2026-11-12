import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildConferenceMediaPlaybackPlan, assertConferenceSourceJoinEvidence} from '../scripts/conference-media-browser-contract.mjs';
import {CONFERENCE_MEDIA_SETTINGS, CONFERENCE_MEDIA_LIMITS, assertConferenceMediaManifest} from '../dist/conference/media.js';
import {conferenceSegmentIndex, conferenceMappedPage} from '../dist/conference/player.js';

const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);

function smallTimeline() {
  const pages = [null, {first:1,second:null}, {first:null,second:2}, {first:1,second:2},
    null, {first:3,second:3}, {first:null,second:null}, {first:3,second:5}];
  return {
    schemaVersion:1,
    event:{id:'playback-plan-unit-test',title:'Test event',date:'2026-10-31',timezone:'Asia/Seoul',clockStart:'12:00:00',clockEnd:'12:00:20'},
    audio:[{id:'plaud-1',file:'audio/plaud-1.m4a',clockStart:'12:00:00',durationSec:12,available:false},
      {id:'plaud-2',file:'audio/plaud-2.m4a',clockStart:'12:00:12',durationSec:8,available:false}],
    decks:[{id:'first',label:'First',dir:'pages/first',pages:5,imagesAvailable:false},
      {id:'second',label:'Second',dir:'pages/second',pages:5,imagesAvailable:false}],
    talks:[[0,5],[5,17],[17,20]].map(([t0,t1],index)=>({id:String(index).padStart(2,'0'),title:'Program '+index,t0,t1,pageRange:{first:null,second:null}})),
    segments:pages.map((page,index)=>({t0:index,t1:index+.8,text:'Caption '+index,source:'unit#'+index,talk:index<5?'00':'01',page})),
  };
}

// Schema-complete metadata only: these tests never claim to have installed or
// played these files. The real harness verifies disk hashes before planning.
function manifestFor(timeline) {
  const text=JSON.stringify(timeline), inputs=[], decks=[], audio=[], assets=[];
  for(const deck of timeline.decks){
    const sha256=hash('unit PDF '+deck.id);
    inputs.push({id:deck.id,kind:'pdf',file:deck.id+'.pdf',bytes:100,sha256,pageCount:deck.pages});
    decks.push({id:deck.id,dir:deck.dir,pageCount:deck.pages,inputSha256:sha256});
    for(let page=1;page<=deck.pages;page++){
      const file=deck.dir+'/'+String(page).padStart(4,'0')+'.webp';
      assets.push({file,kind:'page',deckId:deck.id,page,bytes:100,sha256:hash(file),width:1800,height:1012});
    }
  }
  let offset=0;
  for(const clip of timeline.audio){
    inputs.push({id:clip.id,kind:'audio',file:clip.id+'.mp3',bytes:100,sha256:hash('unit MP3 '+clip.id),
      t0:offset,t1:offset+clip.durationSec,durationSec:clip.durationSec,decodedSamples:Math.round(clip.durationSec*48000)});
    offset+=clip.durationSec;
  }
  for(const talk of timeline.talks){
    const file='audio/session-'+talk.id+'.m4a';
    const sourceRanges=inputs.filter(input=>input.kind==='audio'&&input.t0<talk.t1&&input.t1>talk.t0).map(input=>{
      const t0=Math.max(talk.t0,input.t0),t1=Math.min(talk.t1,input.t1),sourceT0=t0-input.t0,sourceT1=t1-input.t0;
      return {inputId:input.id,t0,t1,sourceT0,sourceT1,startSample:Math.round(sourceT0*48000),endSample:Math.round(sourceT1*48000)};
    });
    audio.push({id:'session-'+talk.id,talkId:talk.id,file,t0:talk.t0,t1:talk.t1,durationSec:talk.t1-talk.t0,sourceRanges});
    assets.push({file,kind:'audio',talkId:talk.id,bytes:100,sha256:hash(file),durationSec:talk.t1-talk.t0,codec:'aac',channels:1,sampleRate:48000});
  }
  const manifest={schemaVersion:1,kind:'atlas-conference-media',eventId:timeline.event.id,status:'ready',
    settings:{...CONFERENCE_MEDIA_SETTINGS},limits:{...CONFERENCE_MEDIA_LIMITS},
    timeline:{bytes:Buffer.byteLength(text),sha256:hash(text)},deckLock:{bytes:100,sha256:hash('unit lock')},
    toolchain:{unitTest:'metadata only; no installed binary media'},inputs,decks,audio,assets,review:{listening:'pending',visual:'pending'},
    totals:{pageCount:decks.reduce((sum,deck)=>sum+deck.pageCount,0),audioCount:audio.length,assetCount:assets.length,fileCount:assets.length+1,
      assetBytes:assets.length*100,maxAssetBytes:100,existingSiteFileCount:1,siteFileCount:assets.length+2}};
  assertConferenceMediaManifest(manifest,{timeline});
  return manifest;
}

test('playback plan derives distinct pages in original time order and retains them across null rows',()=>{
  const timeline=smallTimeline(),manifest=manifestFor(timeline),before=JSON.stringify({timeline,manifest});
  const plan=buildConferenceMediaPlaybackPlan({timeline,manifest});
  assert.deepEqual(plan.decks,[
    {id:'first',steps:[{page:1,t0:1,file:'pages/first/0001.webp',index:1},{page:3,t0:5,file:'pages/first/0003.webp',index:5}]},
    {id:'second',steps:[{page:2,t0:2,file:'pages/second/0002.webp',index:2},{page:3,t0:5,file:'pages/second/0003.webp',index:5},{page:5,t0:7,file:'pages/second/0005.webp',index:7}]},
  ]);
  assert.deepEqual(plan.sessions.map(clip=>[clip.id,clip.t0,clip.t1]),[['session-00',0,5],['session-01',5,17],['session-02',17,20]]);
  assert.deepEqual(plan.boundaries.map(boundary=>[boundary.eventTime,boundary.from.id,boundary.to.id]),[[5,'session-00','session-01'],[17,'session-01','session-02']]);
  assert.deepEqual(plan.sourceJoins,[{sessionId:'session-01',file:'audio/session-01.m4a',eventTime:12,localTime:7}]);
  assert.equal(plan.fallbackTime,2);
  assert.equal(JSON.stringify({timeline,manifest}),before);
  plan.sessions[0].t0=999;
  assert.equal(manifest.audio[0].t0,0,'Plan session records must not mutate the installed manifest');
});

test('equal-t0 null or duplicate rows use the player last-row selection without losing a reachable page',()=>{
  for(const duplicate of [false,true]){
    const timeline=smallTimeline();timeline.segments[2].t0=1;
    if(duplicate)timeline.segments[2].page.first=1;
    const plan=buildConferenceMediaPlaybackPlan({timeline,manifest:manifestFor(timeline)});
    assert.deepEqual(plan.decks[0].steps[0],{page:1,t0:1,file:'pages/first/0001.webp',index:1});
    const selected=conferenceSegmentIndex(timeline.segments,plan.decks[0].steps[0].t0);
    assert.equal(selected,2);
    assert.equal(conferenceMappedPage(timeline.segments,selected,'first').page,1);
    assert.equal(plan.decks[0].steps.length,2);
  }
});

test('a distinct page overwritten at the same t0 is rejected instead of counted as tested',()=>{
  const timeline=smallTimeline();timeline.segments[2].t0=1;timeline.segments[2].page.first=2;
  assert.equal(conferenceMappedPage(timeline.segments,conferenceSegmentIndex(timeline.segments,1),'first').page,2);
  assert.throws(()=>buildConferenceMediaPlaybackPlan({timeline,manifest:manifestFor(timeline)}),/Mapped page cannot be reached.*first page 1/);
});

test('page reversal, time reversal and a wholly unmapped deck cannot produce a passing plan',()=>{
  const reversedPage=smallTimeline();reversedPage.segments[7].page.first=2;
  assert.throws(()=>buildConferenceMediaPlaybackPlan({timeline:reversedPage,manifest:manifestFor(reversedPage)}),/Mapped page order reverses/);
  const reversedTime=smallTimeline();reversedTime.segments[7].t0=5.5;
  assert.throws(()=>buildConferenceMediaPlaybackPlan({timeline:reversedTime,manifest:manifestFor(reversedTime)}),/Segments must remain ordered/);
  const unmapped=smallTimeline();for(const row of unmapped.segments)if(row.page)row.page.first=null;
  assert.throws(()=>buildConferenceMediaPlaybackPlan({timeline:unmapped,manifest:manifestFor(unmapped)}),/no reachable mapped pages/);
});

test('plan refuses unavailable media and missing, mismatched or reordered real-asset/session records',()=>{
  const timeline=smallTimeline();
  for(const change of [
    manifest=>{manifest.status='unavailable';manifest.decks=[];manifest.audio=[];manifest.assets=[];},
    manifest=>manifest.assets.splice(0,1),
    manifest=>manifest.assets[0].file='pages/first/not-the-installed-page.webp',
    manifest=>manifest.audio[1].t0=4.9,
    manifest=>manifest.audio[1].talkId='00',
    manifest=>manifest.audio.reverse(),
    manifest=>manifest.audio[1].sourceRanges[1].t0=12.1,
  ]){
    const manifest=manifestFor(timeline);change(manifest);
    assert.throws(()=>buildConferenceMediaPlaybackPlan({timeline,manifest}),/valid ready media manifest/);
  }
});

test('locked timeline yields all 200 mapped pages, 15 sessions, 14 boundaries and the single source-13 join',async()=>{
  const timeline=JSON.parse(await readFile(new URL('../dist/conference/timeline.json',import.meta.url),'utf8'));
  const plan=buildConferenceMediaPlaybackPlan({timeline,manifest:manifestFor(timeline)});
  assert.deepEqual(plan.decks.map(deck=>[deck.id,deck.steps.length]),[['final-290',73],['r17-clean-257',127]]);
  assert.equal(plan.sessions.length,15);assert.equal(plan.boundaries.length,14);
  assert.equal(plan.sessions[0].t0,0);assert.equal(plan.sessions.at(-1).t1,20400);
  assert.deepEqual(plan.sourceJoins,[{sessionId:'session-13',file:'audio/session-13.m4a',eventTime:18000,localTime:43.49}]);
  for(const deck of plan.decks)for(const step of deck.steps){
    const selected=conferenceSegmentIndex(timeline.segments,step.t0);
    assert.equal(conferenceMappedPage(timeline.segments,selected,deck.id).page,step.page);
    assert.equal(timeline.segments[step.index].t0,step.t0);
    assert.equal(timeline.segments[step.index].page[deck.id],step.page);
  }
});

const join={sessionId:'session-13',file:'audio/session-13.m4a',eventTime:18000,localTime:43.49};
function evidence(){
  const src='http://127.0.0.1:43210/bitcoin-cycle-atlas/conference/audio/session-13.m4a';
  const offset=join.eventTime-join.localTime;
  return {samples:[17999.5,17999.95,18000.02,18000.5].map((eventTime,index)=>({eventTime,currentTime:eventTime-offset,src,
    paused:false,ended:false,error:null,readyState:4,at:1000+index*50})),
    events:[{type:'playing',at:995},{type:'timeupdate',at:1100},{type:'progress',at:1120}]};
}

test('source-join evidence proves native clock/source continuity while leaving human listening unclaimed',()=>{
  const captured=evidence(),before=JSON.stringify(captured);
  const result=assertConferenceSourceJoinEvidence(captured,join);
  assert.equal(result.passed,true);assert.equal(result.sampleCount,4);assert.equal(result.beforeCount,2);assert.equal(result.afterCount,2);
  assert.equal(result.eventCount,3);assert.equal(result.maximumSampleGapMs,50);assert.equal(result.nativeAdvanceSec,1);
  assert.equal(result.humanListening,'not-performed');assert.equal(JSON.stringify(captured),before);
});

test('quantized capture timestamps preserve every sample and still inspect all native states and events',()=>{
  const captured=evidence(), previous=captured.samples.at(-2);
  Object.assign(captured.samples.at(-1),{at:previous.at,currentTime:previous.currentTime,eventTime:previous.eventTime});
  const before=JSON.stringify(captured),result=assertConferenceSourceJoinEvidence(captured,join);
  assert.equal(result.sampleCount,4);assert.equal(result.beforeCount,2);assert.equal(result.afterCount,2);
  assert.equal(result.eventCount,3);assert.equal(JSON.stringify(captured),before);
  const paused=clone(captured);paused.samples.at(-1).paused=true;
  assert.throws(()=>assertConferenceSourceJoinEvidence(paused,join),/playback paused/,'An equal timestamp must not discard an unhealthy final sample');
  const interrupted=clone(captured);interrupted.events.push({type:'waiting',at:previous.at});
  assert.throws(()=>assertConferenceSourceJoinEvidence(interrupted,join),/interrupted the source join: waiting/);
});

test('source-join receipt requires some observed elapsed capture time even when timestamps are quantized',()=>{
  const captured=evidence();captured.samples.forEach(sample=>sample.at=1000);
  assert.throws(()=>assertConferenceSourceJoinEvidence(captured,join),/no observed elapsed capture time/);
});

test('source-join evidence requires strict observations on both sides, not a seek or exact-boundary sample alone',()=>{
  const after=evidence();after.samples=after.samples.slice(2);
  assert.throws(()=>assertConferenceSourceJoinEvidence(after,join),/No native sample precedes/);
  const before=evidence();before.samples=before.samples.slice(0,2);
  assert.throws(()=>assertConferenceSourceJoinEvidence(before,join),/No native sample follows/);
  const exact=evidence();exact.samples=exact.samples.slice(0,2).map((sample,index)=>({...sample,eventTime:18000,currentTime:43.49,at:1000+index*50}));
  assert.throws(()=>assertConferenceSourceJoinEvidence(exact,join),/No native sample precedes/);
  assert.throws(()=>assertConferenceSourceJoinEvidence({samples:[],events:[]},join),/requires native samples/);
});

test('native source replacement or a wrong session URL cannot pass the source-join receipt',()=>{
  const switched=evidence();switched.samples[2].src=switched.samples[2].src.replace('session-13','session-14');
  assert.throws(()=>assertConferenceSourceJoinEvidence(switched,join),/Native source changed/);
  for(const src of ['http://localhost/conference/audio/session-14.m4a','data:audio/mp4;base64,AAAA','blob:http://localhost/id','']){
    const wrong=evidence();wrong.samples.forEach(sample=>sample.src=src);
    assert.throws(()=>assertConferenceSourceJoinEvidence(wrong,join),/does not match/);
  }
});

test('paused, ended, errored, unready or omitted native states fail at every observed sample',()=>{
  for(const [key,value] of [['paused',true],['ended',true],['error',{code:3}],['readyState',1],['readyState',undefined],['error',undefined],['paused',undefined]]){
    const captured=evidence();captured.samples[1][key]=value;
    assert.throws(()=>assertConferenceSourceJoinEvidence(captured,join),/paused|ended|error|readyState/);
  }
  const minimum=evidence();minimum.samples.forEach(sample=>sample.readyState=2);
  assert.equal(assertConferenceSourceJoinEvidence(minimum,join).passed,true);
});

test('reversed native time, capture order, or fabricated event offsets are rejected',()=>{
  const reversed=evidence();reversed.samples[2].currentTime=reversed.samples[0].currentTime;reversed.samples[2].eventTime=reversed.samples[0].eventTime;
  assert.throws(()=>assertConferenceSourceJoinEvidence(reversed,join),/clock reversed/);
  const order=evidence();order.samples[2].at=order.samples[1].at-1;
  assert.throws(()=>assertConferenceSourceJoinEvidence(order,join),/capture order/);
  const offset=evidence();offset.samples[2].eventTime+=.1;
  assert.throws(()=>assertConferenceSourceJoinEvidence(offset,join),/session offset plus currentTime/);
  const nan=evidence();nan.samples[2].currentTime=NaN;
  assert.throws(()=>assertConferenceSourceJoinEvidence(nan,join),/clocks must be finite/);
});

test('every prohibited event after the monitor baseline fails even between otherwise healthy samples',()=>{
  for(const type of ['waiting','stalled','seeking','seeked','ended','error','abort','emptied','loadstart','pause']){
    const captured=evidence();captured.events.push({type,at:1075});
    assert.throws(()=>assertConferenceSourceJoinEvidence(captured,join),new RegExp('interrupted the source join: '+type));
  }
  const beforeFirstSample=evidence();beforeFirstSample.events.push({type:'pause',at:999});
  assert.throws(()=>assertConferenceSourceJoinEvidence(beforeFirstSample,join),/interrupted the source join: pause/,
    'The caller already trimmed the capture baseline; the checker must not discard an interruption before the first sample');
});

test('event capture and join metadata must be present and well formed',()=>{
  assert.throws(()=>assertConferenceSourceJoinEvidence({samples:evidence().samples},join),/event capture/);
  for(const event of [null,{type:'timeupdate'},{at:1050},{type:'waiting',at:NaN}]){
    const captured=evidence();captured.events=[event];
    assert.throws(()=>assertConferenceSourceJoinEvidence(captured,join),/Captured media event/);
  }
  assert.throws(()=>assertConferenceSourceJoinEvidence(evidence(),{...join,localTime:0}),/finite event and local clocks/);
});
