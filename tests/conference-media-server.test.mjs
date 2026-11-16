import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {CONFERENCE_MEDIA_LIMITS, CONFERENCE_MEDIA_SETTINGS} from '../dist/conference/media.js';
import {createConferenceMediaServer, inspectInstalledConferenceMedia, auditConferenceMediaHttp,
  CONFERENCE_MEDIA_PREFIX} from '../scripts/conference-media-server.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pretty = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const prefix = CONFERENCE_MEDIA_PREFIX;

async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), 'atlas-media-http-')), dist = join(temporary, 'dist');
  await mkdir(join(dist, 'conference'), {recursive:true});
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Transport fixture</title>');
  await writeFile(join(dist, 'app.js'), '// Transport fixture, no browser execution.\n');
  const timeline = {schemaVersion:1,
    event:{id:'synthetic-http-media', title:'Transport fixture', date:'2026-10-31', timezone:'Asia/Seoul', clockStart:'12:33:00', clockEnd:'12:33:03'},
    audio:[{id:'plaud-1', file:'audio/first.m4a', durationSec:2, clockStart:'12:33:00', available:false},
      {id:'plaud-2', file:'audio/second.m4a', durationSec:1, clockStart:'12:33:02', available:false}],
    decks:[{id:'final-290', dir:'pages/final', pages:1, label:'Fixture A', imagesAvailable:false},
      {id:'r17-clean-257', dir:'pages/r17', pages:1, label:'Fixture B', imagesAvailable:false}],
    talks:[[0,.75],[.75,2.5],[2.5,3]].map(([t0,t1], index) => ({id:String(index).padStart(2,'0'), title:'Program '+index, t0,t1,
      pageRange:{'final-290':null,'r17-clean-257':null}})),
    segments:[{source:'fixture#1', talk:'00', t0:0,t1:.5,text:'Synthetic transport caption',page:null}]};
  const timelineBytes = pretty(timeline); await writeFile(join(dist, 'conference/timeline.json'), timelineBytes);
  const inputs = [...timeline.decks.map(deck => ({id:deck.id,kind:'pdf',file:deck.id+'.pdf',bytes:100,sha256:sha(deck.id),pageCount:1})),
    {id:'plaud-1',kind:'audio',file:'first.mp3',bytes:100,sha256:sha('first'),t0:0,t1:2,durationSec:2,decodedSamples:96000},
    {id:'plaud-2',kind:'audio',file:'second.mp3',bytes:100,sha256:sha('second'),t0:2,t1:3,durationSec:1,decodedSamples:48000}];
  const decks = timeline.decks.map((deck,index) => ({id:deck.id,dir:deck.dir,pageCount:1,inputSha256:inputs[index].sha256}));
  const audio = timeline.talks.map(talk => ({id:'session-'+talk.id,talkId:talk.id,file:'audio/session-'+talk.id+'.m4a',
    t0:talk.t0,t1:talk.t1,durationSec:talk.t1-talk.t0,
    sourceRanges:inputs.filter(input => input.kind==='audio' && input.t0<talk.t1 && input.t1>talk.t0).map(input => {
      const t0=Math.max(input.t0,talk.t0),t1=Math.min(input.t1,talk.t1),sourceT0=t0-input.t0,sourceT1=t1-input.t0;
      return {inputId:input.id,t0,t1,sourceT0,sourceT1,startSample:Math.round(sourceT0*48000),endSample:Math.round(sourceT1*48000)};
    })}));
  const assets = [...decks.map(deck => ({file:deck.dir+'/0001.webp',kind:'page',deckId:deck.id,page:1,width:1800,height:1012})),
    ...audio.map(clip => ({file:clip.file,kind:'audio',talkId:clip.talkId,durationSec:clip.durationSec,codec:'aac',channels:1,sampleRate:48000}))];
  // Deliberately tiny transport bytes, not decodable audiovisual fixtures.
  // The browser harness must separately verify actual installed media decoding.
  for (const [index, asset] of assets.entries()) {
    const bytes=Buffer.from(Array.from({length:256+index},(_,byte)=>(byte+index)%256));
    Object.assign(asset,{bytes:bytes.length,sha256:sha(bytes)});
    const file=join(dist,'conference',asset.file); await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes);
  }
  const manifest={schemaVersion:1,kind:'atlas-conference-media',eventId:timeline.event.id,status:'ready',
    settings:{...CONFERENCE_MEDIA_SETTINGS},limits:{...CONFERENCE_MEDIA_LIMITS},timeline:{bytes:timelineBytes.length,sha256:sha(timelineBytes)},
    deckLock:{bytes:100,sha256:sha('synthetic lock')},toolchain:{fixture:'HTTP transport only'},review:{listening:'pending',visual:'pending'},
    inputs,decks,audio,assets,totals:{pageCount:2,audioCount:3,assetCount:5,fileCount:6,
      assetBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0),maxAssetBytes:260,existingSiteFileCount:3,siteFileCount:9}};
  const saveManifest=()=>writeFile(join(dist,'conference/media-manifest.json'),pretty(manifest)); await saveManifest();
  return {temporary,dist,timeline,manifest,saveManifest,cleanup:()=>rm(temporary,{recursive:true,force:true})};
}

async function serve(dist, mode='installed') {
  const {server,receipts}=createConferenceMediaServer({dist,mode});
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  return {server,origin:'http://127.0.0.1:'+server.address().port,receipts,
    async close(){server.closeAllConnections();await new Promise(accept=>server.close(accept));}};
}

async function get(origin,path,options={}) {
  const response=await fetch(origin+path,options),bytes=Buffer.from(await response.arrayBuffer());
  return {response,bytes};
}

function rawGet(origin,path) {
  return new Promise((accept,reject)=>{
    const request=httpRequest(origin,{path},response=>{
      const chunks=[];response.on('data',bytes=>chunks.push(bytes));
      response.on('end',()=>accept({status:response.statusCode,bytes:Buffer.concat(chunks)}));
    });request.on('error',reject);request.end();
  });
}

test('local media server preserves full GET bytes, media MIME and uncompressed HEAD metadata',async()=>{
  const f=await fixture(),s=await serve(f.dist);
  try {
    for(const asset of f.manifest.assets){
      const path=prefix+'/conference/'+asset.file,expected=await readFile(join(f.dist,'conference',asset.file));
      const {response,bytes}=await get(s.origin,path,{headers:{'Accept-Encoding':'gzip, br'}});
      assert.equal(response.status,200);assert.deepEqual(bytes,expected);
      assert.equal(response.headers.get('content-type'),asset.kind==='page'?'image/webp':'audio/mp4');
      assert.equal(response.headers.get('content-length'),String(expected.length));
      assert.equal(response.headers.get('accept-ranges'),'bytes');assert.equal(response.headers.get('content-encoding'),null);
      const head=await get(s.origin,path,{method:'HEAD',headers:{Range:'bytes=3-9'}});
      assert.equal(head.response.status,200);assert.equal(head.bytes.length,0);
      assert.equal(head.response.headers.get('content-length'),String(expected.length));
      assert.equal(head.response.headers.get('content-range'),null,'HEAD ignores Range under RFC 9110');
    }
    const root=await get(s.origin,prefix);assert.equal(root.response.status,200);assert.match(root.bytes.toString(),/Transport fixture/);
    const text=await get(s.origin,prefix+'/app.js',{headers:{'Accept-Encoding':'gzip'}});
    assert.equal(text.response.headers.get('content-encoding'),null);
    const post=await get(s.origin,prefix+'/app.js',{method:'POST'});
    assert.equal(post.response.status,405);assert.equal(post.response.headers.get('allow'),'GET, HEAD');
  } finally {await s.close();await f.cleanup();}
});

test('closed, open-ended, suffix and EOF-clipped GET ranges return exact file slices and receipts',async()=>{
  const f=await fixture(),s=await serve(f.dist),asset=f.manifest.assets.find(asset=>asset.kind==='audio');
  const bytes=await readFile(join(f.dist,'conference',asset.file)),last=bytes.length-1,path=prefix+'/conference/'+asset.file;
  try {
    const cases=[['bytes=0-31',0,31],['bytes=12-12',12,12],['bytes=10-',10,last],['bytes=-32',last-31,last],
      ['bytes=-99999999999999999999',0,last],['bytes=200-99999999999999999999',200,last],['bytes=010-015',10,15]];
    for(const [range,start,end]of cases){
      const received=await get(s.origin,path,{headers:{Range:range}});
      assert.equal(received.response.status,206,range);assert.deepEqual(received.bytes,bytes.subarray(start,end+1),range);
      assert.equal(received.response.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);
      assert.equal(received.response.headers.get('content-length'),String(end-start+1));
      assert.equal(received.response.headers.get('accept-ranges'),'bytes');
      assert.equal(received.response.headers.get('content-encoding'),null);
    }
    assert.equal(s.receipts.length,cases.length);
    assert.ok(s.receipts.every(receipt=>receipt.status===206&&receipt.complete&&receipt.contentRange&&receipt.contentType==='audio/mp4'));
    assert.deepEqual(s.receipts.map(receipt=>receipt.bytesSent),cases.map(([,start,end])=>end-start+1));
  } finally {await s.close();await f.cleanup();}
});

test('invalid, multiple, empty and unsatisfiable ranges fail closed with 416 and no media body',async()=>{
  const f=await fixture(),s=await serve(f.dist),asset=f.manifest.assets.find(asset=>asset.kind==='audio');
  try {
    for(const range of ['bytes=','bytes=-','items=0-2','bytes=0-1,4-5','bytes=2-1','bytes=-0',
      'bytes='+asset.bytes+'-','bytes=99999999999999999999-']){
      const {response,bytes}=await get(s.origin,prefix+'/conference/'+asset.file,{headers:{Range:range}});
      assert.equal(response.status,416,range);assert.equal(bytes.length,0);
      assert.equal(response.headers.get('content-range'),'bytes */'+asset.bytes);
      assert.equal(response.headers.get('content-length'),'0');assert.equal(response.headers.get('accept-ranges'),'bytes');
    }
    await writeFile(join(f.dist,'conference/audio/empty.m4a'),'');
    const empty=await get(s.origin,prefix+'/conference/audio/empty.m4a',{headers:{Range:'bytes=0-'}});
    assert.equal(empty.response.status,416);assert.equal(empty.response.headers.get('content-range'),'bytes */0');
  } finally {await s.close();await f.cleanup();}
});

test('URL traversal, encoded separators and symlinks cannot expose files outside the served package',async()=>{
  const f=await fixture(),s=await serve(f.dist);
  try {
    await writeFile(join(f.temporary,'private.txt'),'outside secret');
    await symlink(join(f.temporary,'private.txt'),join(f.dist,'outside.txt'));
    await symlink(join(f.dist,'index.html'),join(f.dist,'inside.html'));
    const cases=[['/outside.txt',404],[prefix+'/../private.txt',400],[prefix+'/%2e%2e/private.txt',400],
      [prefix+'/%5c..%5cprivate.txt',400],[prefix+'/%00',400],[prefix+'/%zz',400],
      [prefix+'/outside.txt',403],[prefix+'/inside.html',403]];
    for(const [path,status]of cases){const result=await rawGet(s.origin,path);assert.equal(result.status,status,path);assert.doesNotMatch(result.bytes.toString(),/outside secret/);}
  } finally {await s.close();await f.cleanup();}
});

test('virtual missing/unavailable modes block media and leave every installed byte untouched',async()=>{
  const f=await fixture();
  const files=['conference/media-manifest.json','conference/timeline.json',...f.manifest.assets.map(asset=>'conference/'+asset.file)];
  const before=await Promise.all(files.map(file=>readFile(join(f.dist,file))));
  try {
    for(const mode of ['missing','unavailable']){
      const s=await serve(f.dist,mode);
      try {
        const manifest=await get(s.origin,prefix+'/conference/media-manifest.json');
        assert.equal(manifest.response.status,mode==='missing'?404:200);
        if(mode==='unavailable')assert.deepEqual(JSON.parse(manifest.bytes),{schemaVersion:1,kind:'atlas-conference-media',eventId:f.timeline.event.id,status:'unavailable',decks:[],audio:[],assets:[]});
        for(const asset of f.manifest.assets){const request=await get(s.origin,prefix+'/conference/'+asset.file,{headers:{Range:'bytes=0-3'}});assert.equal(request.response.status,404);}
        assert.equal((await get(s.origin,prefix+'/conference/timeline.json')).response.status,200);
      } finally {await s.close();}
    }
    assert.deepEqual(await Promise.all(files.map(file=>readFile(join(f.dist,file)))),before);
  } finally {await f.cleanup();}
});

test('preflight binds exact manifest/timeline identities and every declared installed file',async()=>{
  const f=await fixture();
  try {
    const result=await inspectInstalledConferenceMedia({dist:f.dist});
    assert.equal(result.status,'passed',JSON.stringify(result.errors));assert.equal(result.passed,true);assert.equal(result.skipped,false);
    assert.equal(result.assets.length,5);assert.equal(result.counts.verifiedAssetCount,5);assert.equal(result.counts.observedSiteFileCount,9);
    for(const [name,file]of [['manifest','conference/media-manifest.json'],['timeline','conference/timeline.json']]){
      const bytes=await readFile(join(f.dist,file));assert.deepEqual(result.identities[name],{file,bytes:bytes.length,sha256:sha(bytes)});
    }
  } finally {await f.cleanup();}
});

test('only missing or schema-valid unavailable media skips; incomplete and malformed ready packages fail',async t=>{
  const cases=[
    ['missing manifest','skipped',f=>rm(join(f.dist,'conference/media-manifest.json'))],
    ['unavailable manifest','skipped',f=>writeFile(join(f.dist,'conference/media-manifest.json'),pretty({schemaVersion:1,kind:'atlas-conference-media',eventId:f.timeline.event.id,status:'unavailable',decks:[],audio:[],assets:[]}))],
    ['malformed JSON','failed',f=>writeFile(join(f.dist,'conference/media-manifest.json'),'{bad')],
    ['malformed ready schema','failed',f=>writeFile(join(f.dist,'conference/media-manifest.json'),pretty({status:'ready'}))],
    ['missing ready asset','failed',f=>rm(join(f.dist,'conference',f.manifest.assets[0].file))],
    ['altered ready asset','failed',f=>writeFile(join(f.dist,'conference',f.manifest.assets[0].file),'corrupt')],
    ['changed timeline bytes','failed',async f=>{const path=join(f.dist,'conference/timeline.json');await writeFile(path,(await readFile(path)).toString()+' ');}],
    ['unexpected media','failed',f=>writeFile(join(f.dist,'conference/audio/undeclared.m4a'),'extra')],
    ['symlink asset','failed',async f=>{const file=join(f.dist,'conference',f.manifest.assets[0].file);await rm(file);await symlink(join(f.dist,'index.html'),file);}],
  ];
  for(const [name,status,change]of cases)await t.test(name,async()=>{
    const f=await fixture();try {await change(f);const result=await inspectInstalledConferenceMedia({dist:f.dist});assert.equal(result.status,status,JSON.stringify(result.errors));assert.equal(result.passed,false);if(status==='skipped')assert.ok(result.reason);else assert.ok(result.errors.length);}finally{await f.cleanup();}
  });
});

test('HTTP audit verifies every image MIME and all sessions closed/open/suffix bytes plus unsatisfiable status',async()=>{
  const f=await fixture(),s=await serve(f.dist);
  try {
    const preflight=await inspectInstalledConferenceMedia({dist:f.dist});
    const result=await auditConferenceMediaHttp({origin:s.origin,preflight});
    assert.equal(result.status,'passed',JSON.stringify(result.errors));assert.deepEqual(result.counts,{images:2,sessions:3,ranges:9});
    assert.ok(result.sessions.every(session=>session.ranges.every(range=>range.sha256===range.expectedSha256)&&session.unsatisfiable.status===416));
    const skipped=await auditConferenceMediaHttp({origin:s.origin,preflight:{status:'skipped',reason:'No installed media'}});
    assert.equal(skipped.status,'skipped');assert.equal(skipped.passed,false);
  } finally {await s.close();await f.cleanup();}
});

test('a client-aborted large media response retains the actual sent 206 headers in its receipt',async()=>{
  const f=await fixture(),s=await serve(f.dist);
  try {
    const name='conference/audio/large.m4a',size=8*1024*1024;await writeFile(join(f.dist,name),Buffer.alloc(size,7));
    await new Promise((accept,reject)=>{
      const request=httpRequest(s.origin,{path:prefix+'/'+name,headers:{Range:'bytes=0-'}},response=>{
        response.once('data',()=>{response.destroy();accept();});response.on('error',()=>{});
      });request.on('error',reject);request.end();
    });
    for(let attempts=0;attempts<50&&!s.receipts.some(receipt=>receipt.path===name&&(receipt.complete||receipt.aborted));attempts++)await new Promise(accept=>setImmediate(accept));
    const receipt=s.receipts.find(item=>item.path===name);
    assert.ok(receipt);assert.equal(receipt.status,206);assert.equal(receipt.contentRange,`bytes 0-${size-1}/${size}`);
    assert.equal(receipt.contentLength,size);assert.equal(receipt.acceptRanges,'bytes');assert.equal(receipt.contentEncoding,null);
    assert.equal(receipt.aborted,true);assert.equal(receipt.complete,false);assert.ok(receipt.bytesSent<size);
  } finally {await s.close();await f.cleanup();}
});

test('an abort before file headers keeps a pending receipt and does not start a stream after response close',async()=>{
  const f=await fixture(),s=await serve(f.dist),asset=f.manifest.assets.find(item=>item.kind==='audio');
  try {
    let pending;
    // The additional request listener runs while the async handler is awaiting
    // its root lookup, making this pre-header cancellation deterministic.
    s.server.once('request',(_request,response)=>{
      pending=s.receipts.at(-1);
      assert.ok(pending,'Receipt is visible from request start');
      assert.equal(pending.status,null);assert.equal(pending.complete,false);assert.equal(pending.aborted,false);
      response.destroy();
    });
    const error=await new Promise((accept,reject)=>{
      const request=httpRequest(s.origin,{path:prefix+'/conference/'+asset.file,headers:{Range:'bytes=0-'}},()=>reject(new Error('No headers expected')));
      request.once('error',accept);request.end();
    });
    assert.equal(error.code,'ECONNRESET');
    const next=await get(s.origin,prefix+'/conference/'+asset.file);
    assert.equal(next.response.status,200);assert.equal(next.bytes.length,asset.bytes);
    assert.equal(pending.aborted,true);assert.equal(pending.complete,false);assert.equal(pending.status,null);
    assert.equal(pending.contentRange,null);assert.equal(pending.contentType,null);assert.equal(pending.bytesSent,0);
    assert.equal(s.receipts.length,2);
  } finally {await s.close();await f.cleanup();}
});
