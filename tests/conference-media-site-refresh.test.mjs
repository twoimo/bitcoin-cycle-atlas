import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cp, mkdtemp, mkdir, readFile, readdir, rename, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {CONFERENCE_MEDIA_LIMITS, CONFERENCE_MEDIA_SETTINGS} from '../dist/conference/media.js';
import {inspectInstalledConferenceMedia} from '../scripts/conference-media-server.mjs';
import {refreshConferenceMediaSite} from '../scripts/refresh-conference-media-site.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pretty = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const manifestPath = 'conference/media-manifest.json';

// This fixture has five tiny identity-check assets, not real or decodable
// conference media. It exercises file preparation only and never starts a
// browser. Its results do not count toward the real 562-asset or 20-case gate.
async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), 'atlas-media-site-refresh-'));
  const dist = join(temporary, 'isolated'), siteDist = join(temporary, 'source');
  await mkdir(join(dist, 'conference'), {recursive:true});
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Inventory fixture</title>');
  await writeFile(join(dist, 'app.js'), '// Identity fixture; no browser execution.\n');
  const timeline = {schemaVersion:1,
    event:{id:'synthetic-site-refresh',title:'Inventory fixture',date:'2026-10-31',timezone:'Asia/Seoul',clockStart:'12:33:00',clockEnd:'12:33:03'},
    audio:[{id:'plaud-1',file:'audio/first.m4a',durationSec:2,clockStart:'12:33:00',available:false},
      {id:'plaud-2',file:'audio/second.m4a',durationSec:1,clockStart:'12:33:02',available:false}],
    decks:[{id:'final-290',dir:'pages/final',pages:1,label:'Fixture A',imagesAvailable:false},
      {id:'r17-clean-257',dir:'pages/r17',pages:1,label:'Fixture B',imagesAvailable:false}],
    talks:[[0,.75],[.75,2.5],[2.5,3]].map(([t0,t1],index)=>({id:String(index).padStart(2,'0'),title:'Program '+index,t0,t1,
      pageRange:{'final-290':null,'r17-clean-257':null}})),
    segments:[{source:'fixture#1',talk:'00',t0:0,t1:.5,text:'Inventory fixture caption',page:null}]};
  const timelineBytes = pretty(timeline);
  await writeFile(join(dist,'conference/timeline.json'),timelineBytes);
  const inputs = [...timeline.decks.map(deck=>({id:deck.id,kind:'pdf',file:deck.id+'.pdf',bytes:100,sha256:sha(deck.id),pageCount:1})),
    {id:'plaud-1',kind:'audio',file:'first.mp3',bytes:100,sha256:sha('first'),t0:0,t1:2,durationSec:2,decodedSamples:96000},
    {id:'plaud-2',kind:'audio',file:'second.mp3',bytes:100,sha256:sha('second'),t0:2,t1:3,durationSec:1,decodedSamples:48000}];
  const decks = timeline.decks.map((deck,index)=>({id:deck.id,dir:deck.dir,pageCount:1,inputSha256:inputs[index].sha256}));
  const audio = timeline.talks.map(talk=>({id:'session-'+talk.id,talkId:talk.id,file:'audio/session-'+talk.id+'.m4a',
    t0:talk.t0,t1:talk.t1,durationSec:talk.t1-talk.t0,
    sourceRanges:inputs.filter(input=>input.kind==='audio'&&input.t0<talk.t1&&input.t1>talk.t0).map(input=>{
      const t0=Math.max(input.t0,talk.t0),t1=Math.min(input.t1,talk.t1),sourceT0=t0-input.t0,sourceT1=t1-input.t0;
      return {inputId:input.id,t0,t1,sourceT0,sourceT1,startSample:Math.round(sourceT0*48000),endSample:Math.round(sourceT1*48000)};
    })}));
  const assets = [...decks.map(deck=>({file:deck.dir+'/0001.webp',kind:'page',deckId:deck.id,page:1,width:1800,height:1012})),
    ...audio.map(clip=>({file:clip.file,kind:'audio',talkId:clip.talkId,durationSec:clip.durationSec,codec:'aac',channels:1,sampleRate:48000}))];
  for (const [index,asset] of assets.entries()) {
    const bytes=Buffer.from(Array.from({length:256+index},(_,byte)=>(byte+index)%256));
    Object.assign(asset,{bytes:bytes.length,sha256:sha(bytes)});
    const file=join(dist,'conference',asset.file);
    await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes);
  }
  const manifest={schemaVersion:1,kind:'atlas-conference-media',eventId:timeline.event.id,status:'ready',
    settings:{...CONFERENCE_MEDIA_SETTINGS},limits:{...CONFERENCE_MEDIA_LIMITS},timeline:{bytes:timelineBytes.length,sha256:sha(timelineBytes)},
    deckLock:{bytes:100,sha256:sha('synthetic lock')},toolchain:{fixture:'Inventory identity tests only'},review:{listening:'pending',visual:'pending'},
    inputs,decks,audio,assets,totals:{pageCount:2,audioCount:3,assetCount:5,fileCount:6,
      assetBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0),maxAssetBytes:260,existingSiteFileCount:3,siteFileCount:9}};
  await writeFile(join(dist,manifestPath),pretty(manifest));
  await cp(dist,siteDist,{recursive:true,errorOnExist:true,force:false});
  const unavailable={schemaVersion:1,kind:'atlas-conference-media',eventId:timeline.event.id,status:'unavailable',decks:[],audio:[],assets:[]};
  await writeFile(join(siteDist,manifestPath),pretty(unavailable));
  // Two later retained paths make the old 3+5+1=9 total stale. Both trees
  // already contain the five declared assets, so counting must not add twice.
  for (const tree of [siteDist,dist]) {
    await mkdir(join(tree,'fonts'),{recursive:true});
    await writeFile(join(tree,'fonts/license.txt'),'Fixture license\n');
    await writeFile(join(tree,'fonts/subset.woff2'),Buffer.from([1,2,3,4]));
  }
  return {temporary,siteDist,dist,manifest,unavailable,
    options:{siteDist,dist},cleanup:()=>rm(temporary,{recursive:true,force:true})};
}

async function snapshot(root,prefix='') {
  const rows=[];
  for (const entry of (await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
    const name=prefix?prefix+'/'+entry.name:entry.name;
    if (entry.isDirectory()) rows.push(...await snapshot(root,name));
    else {
      const path=join(root,name),info=await stat(path),bytes=await readFile(path);
      rows.push({name,bytes:bytes.length,sha256:sha(bytes),ino:info.ino,mtimeMs:info.mtimeMs});
    }
  }
  return rows;
}

test('refresh recounts current retained files and changes only the two isolated ready-manifest totals',async()=>{
  const f=await fixture();
  try {
    const sourceBefore=await snapshot(f.siteDist),targetBefore=await snapshot(f.dist);
    const before=await inspectInstalledConferenceMedia({dist:f.dist});
    assert.equal(before.passed,false);assert.deepEqual(before.errors.map(error=>error.code),['site_file_count']);
    assert.equal(before.counts.verifiedAssetCount,5);assert.equal(before.counts.observedSiteFileCount,11);
    const out=join(f.temporary,'refresh-receipt.json');
    const result=await refreshConferenceMediaSite({...f.options,out});
    assert.equal(result.status,'passed');assert.equal(result.mode,'refreshed');
    assert.equal(result.totals.existingSiteFileCount,5);assert.equal(result.totals.siteFileCount,11);
    assert.equal(result.observedSiteFileCount,11);assert.equal(result.verifiedAssetCount,5);
    const expected=structuredClone(f.manifest);
    expected.totals.existingSiteFileCount=5;expected.totals.siteFileCount=11;
    assert.deepEqual(JSON.parse(await readFile(join(f.dist,manifestPath),'utf8')),expected);
    assert.deepEqual(await snapshot(f.siteDist),sourceBefore,'canonical source and existing media remain untouched');
    assert.deepEqual((await snapshot(f.dist)).filter(row=>row.name!==manifestPath),targetBefore.filter(row=>row.name!==manifestPath),
      'no installed asset or retained site file was rewritten');
    const after=await inspectInstalledConferenceMedia({dist:f.dist});
    assert.equal(after.passed,true,JSON.stringify(after.errors));assert.equal(after.counts.observedSiteFileCount,11);
    const receipt=JSON.parse(await readFile(out,'utf8'));assert.equal(receipt.status,'passed');
  } finally {await f.cleanup();}
});

test('refresh is idempotent and a repeated run rewrites neither manifest nor assets',async()=>{
  const f=await fixture();
  try {
    await refreshConferenceMediaSite(f.options);
    const sourceBefore=await snapshot(f.siteDist),targetBefore=await snapshot(f.dist);
    const again=await refreshConferenceMediaSite(f.options);
    assert.equal(again.status,'passed');assert.equal(again.mode,'unchanged');
    assert.equal(again.totals.existingSiteFileCount,5);assert.equal(again.totals.siteFileCount,11);
    assert.deepEqual(await snapshot(f.siteDist),sourceBefore);assert.deepEqual(await snapshot(f.dist),targetBefore);
  } finally {await f.cleanup();}
});

test('refresh rejects missing, corrupt, extra or symlinked media before changing the manifest',async t=>{
  const cases=[
    ['missing',f=>rm(join(f.dist,'conference',f.manifest.assets[0].file))],
    ['corrupt',f=>writeFile(join(f.dist,'conference',f.manifest.assets[0].file),'corrupt')],
    ['extra',f=>writeFile(join(f.dist,'conference/audio/undeclared.m4a'),'extra')],
    ['symlink',async f=>{const p=join(f.dist,'conference',f.manifest.assets[0].file);await rm(p);await symlink(join(f.siteDist,'conference',f.manifest.assets[0].file),p);}],
  ];
  for (const [name,mutate] of cases) await t.test(name,async()=>{
    const f=await fixture();
    try {
      await mutate(f);const before=await readFile(join(f.dist,manifestPath));
      const sourceBefore=await snapshot(f.siteDist);
      await assert.rejects(refreshConferenceMediaSite(f.options));
      assert.deepEqual(await readFile(join(f.dist,manifestPath)),before);assert.deepEqual(await snapshot(f.siteDist),sourceBefore);
    } finally {await f.cleanup();}
  });
});

test('refresh rejects wrong retained counts or paths even when the media hashes match',async t=>{
  const cases=[
    ['missing retained file',f=>rm(join(f.dist,'fonts/subset.woff2'))],
    ['extra retained file',f=>writeFile(join(f.dist,'extra.js'),'extra')],
    ['same count, wrong path',f=>rename(join(f.dist,'fonts/license.txt'),join(f.dist,'fonts/wrong-license.txt'))],
  ];
  for (const [name,mutate] of cases) await t.test(name,async()=>{
    const f=await fixture();
    try {
      await mutate(f);const before=await readFile(join(f.dist,manifestPath));
      await assert.rejects(refreshConferenceMediaSite(f.options));
      assert.deepEqual(await readFile(join(f.dist,manifestPath)),before);
    } finally {await f.cleanup();}
  });
});

test('refresh requires source timeline identity and an existing ready manifest',async t=>{
  const cases=[
    ['different source timeline',async f=>{const p=join(f.siteDist,'conference/timeline.json');await writeFile(p,(await readFile(p)).toString()+' ');}],
    ['unavailable target',f=>writeFile(join(f.dist,manifestPath),pretty(f.unavailable))],
    ['missing target manifest',f=>rm(join(f.dist,manifestPath))],
  ];
  for (const [name,mutate] of cases) await t.test(name,async()=>{
    const f=await fixture();
    try {await mutate(f);const sourceBefore=await snapshot(f.siteDist);await assert.rejects(refreshConferenceMediaSite(f.options));assert.deepEqual(await snapshot(f.siteDist),sourceBefore);}
    finally {await f.cleanup();}
  });
});

test('refresh refuses overlapping source/target trees and receipts inside either counted tree',async t=>{
  const cases=[
    ['same directory',f=>({...f.options,dist:f.siteDist})],
    ['target below source',f=>({...f.options,dist:join(f.siteDist,'nested')})],
    ['source below target',f=>({...f.options,siteDist:join(f.dist,'conference')})],
    ['receipt in source',f=>({...f.options,out:join(f.siteDist,'receipt.json')})],
    ['receipt in target',f=>({...f.options,out:join(f.dist,'receipt.json')})],
  ];
  for (const [name,options] of cases) await t.test(name,async()=>{
    const f=await fixture();
    try {const before=await readFile(join(f.dist,manifestPath));await assert.rejects(refreshConferenceMediaSite(options(f)));assert.deepEqual(await readFile(join(f.dist,manifestPath)),before);}
    finally {await f.cleanup();}
  });
});

test('refresh refuses the repository canonical dist as its writable target',async()=>{
  const f=await fixture(),canonical=resolve('dist'),before=await readFile(join(canonical,manifestPath));
  try {await assert.rejects(refreshConferenceMediaSite({...f.options,dist:canonical}));assert.deepEqual(await readFile(join(canonical,manifestPath)),before);}
  finally {await f.cleanup();}
});

test('the unchanged preflight still rejects an extra installed file after successful refresh',async()=>{
  const f=await fixture();
  try {
    await refreshConferenceMediaSite(f.options);
    await writeFile(join(f.dist,'extra-after-refresh.js'),'extra');
    const result=await inspectInstalledConferenceMedia({dist:f.dist});
    assert.equal(result.passed,false);assert.equal(result.counts.verifiedAssetCount,5);
    assert.equal(result.counts.observedSiteFileCount,12);assert.equal(result.manifest.totals.siteFileCount,11);
    assert.ok(result.errors.some(error=>error.code==='site_file_count'));
  } finally {await f.cleanup();}
});
