import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  CONFERENCE_MEDIA_LIMITS, CONFERENCE_MEDIA_SETTINGS,
  validateConferenceMediaManifest, assertConferenceMediaManifest, conferenceMediaOverlay,
} from '../dist/conference/media.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const sample = seconds => Math.round(seconds * 48000);
const clone = value => structuredClone(value);

// Metadata-only synthetic contract. Binary media fixtures are created at run
// time by conference-media-build.test.mjs and are never committed.
function fixture() {
  const timeline = {event:{id:'synthetic-media-schema'},
    decks:[{id:'final-290', dir:'pages/final', pages:2}, {id:'r17-clean-257', dir:'pages/r17', pages:1}],
    audio:[{id:'plaud-1', durationSec:2}, {id:'plaud-2', durationSec:1}],
    talks:[[0,.75],[.75,2.5],[2.5,3]].map(([t0,t1], index) => ({id:String(index).padStart(2,'0'), t0,t1})),
    segments:[{t0:0,t1:.5,text:'Synthetic caption',page:null}]};
  const inputs = [
    ...timeline.decks.map(deck => ({id:deck.id, kind:'pdf', file:deck.id + '.pdf', bytes:128, sha256:sha(deck.id), pageCount:deck.pages})),
    {id:'plaud-1', kind:'audio', file:'first.mp3', bytes:256, sha256:sha('first'), t0:0,t1:2,durationSec:2,decodedSamples:96000},
    {id:'plaud-2', kind:'audio', file:'second.mp3', bytes:128, sha256:sha('second'), t0:2,t1:3,durationSec:1,decodedSamples:48000},
  ];
  const decks = timeline.decks.map((deck,index) => ({id:deck.id, dir:deck.dir, pageCount:deck.pages,inputSha256:inputs[index].sha256}));
  const audio = timeline.talks.map(talk => ({id:'session-'+talk.id,talkId:talk.id,file:'audio/session-'+talk.id+'.m4a',
    t0:talk.t0,t1:talk.t1,durationSec:talk.t1-talk.t0,
    sourceRanges:inputs.filter(input => input.kind === 'audio' && input.t0 < talk.t1 && input.t1 > talk.t0).map(input => {
      const t0 = Math.max(input.t0,talk.t0), t1 = Math.min(input.t1,talk.t1);
      return {inputId:input.id,t0,t1,sourceT0:t0-input.t0,sourceT1:t1-input.t0,startSample:sample(t0-input.t0),endSample:sample(t1-input.t0)};
    })}));
  const assets = [
    ...decks.flatMap(deck => Array.from({length:deck.pageCount},(_,index) => {
      const page=index+1, file=deck.dir+'/'+String(page).padStart(4,'0')+'.webp';
      return {file,kind:'page',bytes:128,sha256:sha(file),deckId:deck.id,page,width:1800,height:1012};
    })),
    ...audio.map(clip => ({file:clip.file,kind:'audio',bytes:256,sha256:sha(clip.file),talkId:clip.talkId,
      durationSec:clip.durationSec,codec:'aac',channels:1,sampleRate:48000})),
  ];
  const raw=JSON.stringify(timeline), timelineSha256=sha(raw);
  const manifest={schemaVersion:1,kind:'atlas-conference-media',eventId:timeline.event.id,status:'ready',
    settings:{...CONFERENCE_MEDIA_SETTINGS},limits:{...CONFERENCE_MEDIA_LIMITS},
    timeline:{bytes:Buffer.byteLength(raw),sha256:timelineSha256},deckLock:{bytes:128,sha256:sha('synthetic lock')},
    toolchain:{fixture:'metadata only'},inputs,decks,audio,assets,
    review:{listening:'pending',visual:'pending'},totals:{existingSiteFileCount:2}};
  recount(manifest);
  return {manifest,timeline,context:{timeline,timelineSha256}};
}

function recount(manifest) {
  const {assets,totals} = manifest;
  Object.assign(totals, {pageCount:assets.filter(asset=>asset.kind==='page').length,
    audioCount:assets.filter(asset=>asset.kind==='audio').length,assetCount:assets.length,
    fileCount:assets.length+1,assetBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0),
    maxAssetBytes:Math.max(...assets.map(asset=>asset.bytes)),siteFileCount:totals.existingSiteFileCount+assets.length+1});
}
function invalid(manifest,context,code) {
  const result=validateConferenceMediaManifest(manifest,context);
  assert.equal(result.valid,false);
  assert.equal(result.available,false);
  if(code) assert.ok(result.errors.some(error=>error.code===code),JSON.stringify(result.errors));
  return result;
}

test('committed unavailable metadata declares zero assets without pretending to contain media',async()=>{
  const absent=JSON.parse(await readFile(new URL('../dist/conference/media-manifest.json',import.meta.url)));
  assert.equal(validateConferenceMediaManifest(absent).valid,true);
  assert.equal(validateConferenceMediaManifest(absent).available,false);
  assert.equal(conferenceMediaOverlay(absent),null);
  const changed=clone(absent); changed.assets.push({file:'placeholder.webp'});
  invalid(changed,undefined,'unavailable_assets');
});

test('ready schema preserves canonical filenames, complete sessions and a separate immutable timeline overlay',()=>{
  const {manifest,timeline,context}=fixture(), before=JSON.stringify({manifest,timeline});
  const result=validateConferenceMediaManifest(manifest,context);
  assert.equal(result.valid,true,JSON.stringify(result.errors));
  assert.deepEqual(result.summary,{pageCount:3,audioCount:3,assetCount:6,assetBytes:1152,fileCount:7,siteFileCount:9});
  assert.equal(assertConferenceMediaManifest(manifest,context),manifest);
  const overlay=conferenceMediaOverlay(manifest,context);
  assert.deepEqual(overlay.clips.map(clip=>[clip.file,clip.offset,clip.durationSec]),[
    ['audio/session-00.m4a',0,.75],['audio/session-01.m4a',.75,1.75],['audio/session-02.m4a',2.5,.5]]);
  assert.ok(overlay.decks.every(deck=>deck.imagesAvailable));
  overlay.decks[0].dir='changed-only-in-overlay'; overlay.clips[0].offset=99;
  assert.equal(JSON.stringify({manifest,timeline}),before);
});

test('schema binds media to event, exact timeline bytes and the unchanged deck/program contract',()=>{
  const {manifest,context}=fixture();
  for(const change of [
    m=>m.eventId='another-event', m=>m.timeline.sha256=sha('different timeline'),
    m=>m.decks[0].dir='pages/other', m=>m.decks[0].pageCount=3,
    m=>m.audio[1].t0=.5, m=>m.audio[1].talkId='14',
  ]) { const changed=clone(manifest); change(changed); invalid(changed,context); }
});

test('schema rejects missing, duplicated, reordered and unsafe asset paths',()=>{
  const {manifest,context}=fixture();
  for(const change of [
    m=>m.assets.pop(), m=>m.assets.push(clone(m.assets[0])),
    m=>m.assets.reverse(), m=>m.assets[0].file='pages/final/1.webp',
    m=>m.assets[0].file='../outside.webp', m=>m.assets[0].file='https://elsewhere.test/image.webp',
    m=>m.assets[0].page=2, m=>m.assets[3].file='audio/session-0.m4a',
  ]) { const changed=clone(manifest); change(changed); invalid(changed,context); }
});

test('25 MiB and 20,000-file boundaries include the manifest and the retained site',()=>{
  const {manifest,context}=fixture(), max=CONFERENCE_MEDIA_LIMITS.maxFileBytes;
  manifest.assets[0].bytes=max; recount(manifest);
  assert.equal(validateConferenceMediaManifest(manifest,{...context,manifestBytes:max}).valid,true);
  manifest.assets[0].bytes=max+1; recount(manifest);
  invalid(manifest,context,'asset_size');
  manifest.assets[0].bytes=128; recount(manifest);
  invalid(manifest,{...context,manifestBytes:max+1},'manifest_size');
  manifest.totals.existingSiteFileCount=20000-manifest.totals.fileCount; recount(manifest);
  assert.equal(validateConferenceMediaManifest(manifest,context).valid,true);
  manifest.totals.existingSiteFileCount++; recount(manifest);
  invalid(manifest,context,'site_limit');
  const huge=clone(manifest); huge.assets=Array(20000).fill(manifest.assets[0]);
  invalid(huge,context,'file_count');
});

test('settings and limits cannot silently relax the rendering or delivery contract',()=>{
  const {manifest,context}=fixture();
  assert.equal(CONFERENCE_MEDIA_LIMITS.maxFileBytes,26214400);
  for(const [key,value] of Object.entries(CONFERENCE_MEDIA_SETTINGS)) {
    const changed=clone(manifest); changed.settings[key]=typeof value==='number'?value+1:'other';
    invalid(changed,context,'media_settings');
  }
  for(const key of Object.keys(CONFERENCE_MEDIA_LIMITS)) {
    const changed=clone(manifest); changed.limits[key]++;
    invalid(changed,context,'media_limits');
  }
});

test('source windows and exact decoded samples cover the whole event without fabricated padding',()=>{
  const {manifest,context}=fixture();
  for(const change of [
    m=>m.inputs[3].t0=2.01, m=>m.inputs[3].t1=2.9,
    m=>m.inputs[2].decodedSamples=95999, m=>m.audio[1].sourceRanges.pop(),
    m=>m.audio[1].sourceRanges[1].startSample=1,
    m=>m.audio[1].sourceRanges[0].sourceT1=1.9,
  ]) { const changed=clone(manifest); change(changed); invalid(changed,context); }
});

test('encoded AAC rounding never changes the exact logical session clock',()=>{
  const {manifest,context}=fixture(), frame=1024/48000;
  const audioAsset=manifest.assets.find(asset=>asset.kind==='audio');
  audioAsset.durationSec=manifest.audio[0].durationSec+frame;
  assert.equal(validateConferenceMediaManifest(manifest,context).valid,true);
  assert.equal(conferenceMediaOverlay(manifest,context).clips[0].durationSec,.75);
  audioAsset.durationSec+=.0001;
  invalid(manifest,context,'audio_probe_duration');
});

test('source and asset identities require nonempty bytes, SHA-256 and fixed output encoding',()=>{
  const {manifest,context}=fixture();
  for(const change of [
    m=>m.inputs[0].sha256='not-a-digest', m=>m.inputs[0].file='/private/original.pdf',
    m=>m.assets[0].bytes=0, m=>m.assets[0].sha256='F'.repeat(64),
    m=>m.assets[0].width=1799, m=>m.assets[3].codec='mp3',
    m=>m.assets[3].channels=2, m=>m.assets[3].sampleRate=44100,
    m=>m.totals.assetBytes++, m=>m.review.listening='passed',
  ]) { const changed=clone(manifest); change(changed); invalid(changed,context); }
});

test('JSON-serializable malformed numeric fields return structured failures without coercion exceptions',()=>{
  const {manifest,context}=fixture();
  const poison={toString:null,valueOf:null};
  for(const change of [
    m=>m.inputs[2].t0=poison, m=>m.inputs[3].t1=poison,
    m=>m.decks[0].pageCount=poison, m=>m.decks[0].dir=poison,
    m=>m.audio[1].t0=poison, m=>m.audio[1].t1=poison,
    m=>m.audio[1].durationSec=poison, m=>m.assets[3].durationSec=poison,
    m=>m.totals.existingSiteFileCount=poison, m=>m.assets[0].bytes=poison,
    m=>m.audio[1].sourceRanges[0].sourceT0=poison,
    m=>m.inputs[2].t0='0', m=>m.inputs[2]=null,
  ]) {
    const changed=clone(manifest); change(changed);
    const json=JSON.parse(JSON.stringify(changed));
    assert.doesNotThrow(()=>invalid(json,context));
    assert.throws(()=>assertConferenceMediaManifest(json,context),error=>error instanceof TypeError && error.validation?.valid===false);
  }
  for(const value of [null,[],1,'manifest']) invalid(value,context,'manifest_object');
});
