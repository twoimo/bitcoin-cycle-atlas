import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, cp, copyFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash, webcrypto} from 'node:crypto';
import * as vm from 'node:vm';
import {verifyStandaloneArtifact} from '../scripts/standalone-verification.mjs';
import {REPLAY_ARCHIVE_PATHS, parseReplayPriceArchive, loadReplayPriceArchive} from '../dist/forecast-replay-sources.js';
import {createAssetJournalLoader} from '../dist/asset-forecast-journal.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
const embedded=(html,id)=>{
  const matches=[...html.matchAll(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)<\\/script>','g'))];
  assert.equal(matches.length,1,'exactly one embedded '+id);
  return matches[0][1];
};

// Execute the packaged modules themselves in an offline browser-like realm.
// The main test starts this file with VM modules enabled; no app code is copied.
async function packagedRuntime(file){
  const html=await readFile(file,'utf8'),nodes=new Map();
  for(const match of html.matchAll(/<script id="([^"]+)" type="application\/json">([\s\S]*?)<\/script>/g))nodes.set(match[1],{textContent:match[2]});
  let networkCalls=0;
  const context=vm.createContext({
    crypto:webcrypto,TextEncoder,TextDecoder,URL,DOMException,AbortController,setTimeout,clearTimeout,structuredClone,
    document:{baseURI:'file:///offline-atlas.html',getElementById:id=>nodes.get(id)??null},
    fetch:async()=>{networkCalls++;throw new Error('Offline runtime forbids network');},
  });
  const imports=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const modules=new Map();
  const resolveModule=id=>{assert(modules.has(id),'unmapped runtime module '+id);return modules.get(id);};
  const evaluate=async id=>{
    const module=resolveModule(id);
    if(module.status==='unlinked')await module.link(resolveModule);
    if(module.status==='linked')await module.evaluate();
    return module;
  };
  for(const [id,url]of Object.entries(imports))modules.set(id,new vm.SourceTextModule(Buffer.from(url.slice('data:text/javascript;base64,'.length),'base64').toString('utf8'),{
    context,identifier:id,importModuleDynamically:evaluate,
  }));
  for(const module of modules.values())if(module.status==='unlinked')await module.link(resolveModule);
  const source=(await evaluate('@atlas/forecast-replay-sources.js')).namespace;
  const journal=(await evaluate('@atlas/asset-forecast-journal.js')).namespace;
  const core=(await evaluate('@atlas/forecast-replay.js')).namespace;
  const prices={},records={};
  for(const symbol of Object.keys(REPLAY_ARCHIVE_PATHS)){
    const loaded=await source.loadReplayPriceArchive(symbol);
    prices[symbol]={jsonHash:sha(JSON.stringify(loaded)),sourceHash:loaded.source.sourceHash,observedThrough:loaded.observedThrough};
    if(symbol==='BTCUSD')continue;
    const states=[],loader=journal.createAssetJournalLoader({onState:state=>states.push(state)});
    const saved=await loader.load({symbol});
    assert.equal(saved?.status,'ready',symbol+' offline journal must verify: '+JSON.stringify(states.at(-1)));
    const session=await core.createRecordedReplaySession({...saved,...loaded,horizonDays:180,evaluatedAt:'2026-10-28T23:59:59Z'});
    const frame=core.buildReplayFrame(session,{cursorIndex:session.timeline.length-1});
    records[symbol]={recordHash:sha(JSON.stringify(saved.record)),snapshotHash:sha(JSON.stringify(saved.snapshot)),
      outputHash:session.identity.outputHash,matchedCount:frame.metrics.matchedCount,
      visibleActualThrough:frame.actual.at(-1)?.date??null};
    loader.cancel();
  }
  return {modules:modules.size,prices,records,networkCalls};
}

if(process.argv[2]==='--packaged-runtime'){
  console.log(JSON.stringify(await packagedRuntime(process.argv[3])));
}else{
  let directory,html,archive,assetArchive,runtime;
  before(async()=>{
    directory=await mkdtemp(resolve(tmpdir(),'atlas-replay-standalone-'));
    // Isolate the publication manifest from other packaging tests and the checkout.
    await Promise.all([
      cp(resolve(root,'dist'),resolve(directory,'dist'),{recursive:true}),
      cp(resolve(root,'scripts'),resolve(directory,'scripts'),{recursive:true}),
      copyFile(resolve(root,'package.json'),resolve(directory,'package.json')),
    ]);
    await run('git',['init','--quiet'],{cwd:directory});
    await run('git',['-c','user.name=Atlas Replay Test','-c','user.email=replay-test@example.invalid','-c','core.hooksPath=/dev/null','commit','--allow-empty','--no-gpg-sign','--quiet','-m','Isolated packaging fixture'],{cwd:directory});
    await run(process.execPath,[resolve(directory,'scripts/build-publication.mjs'),'--preview']);
    const file=resolve(directory,'offline.html');
    await run(process.execPath,[resolve(directory,'scripts/build-standalone.mjs'),file]);
    html=await readFile(file,'utf8');
    archive=JSON.parse(embedded(html,'atlas-replay-price-archives'));
    assetArchive=JSON.parse(embedded(html,'atlas-asset-forecast-ledger'));
    const output=await run(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),'--packaged-runtime',file],{maxBuffer:8000000});
    runtime=JSON.parse(output.stdout);
  });
  after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});

  test('standalone retains the complete replay module graph and exact outcome archive bytes',async()=>{
    const verified=await verifyStandaloneArtifact(html,resolve(directory,'dist'));
    assert.equal(runtime.modules,verified.modules);
    const imports=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
    for(const id of ['forecast-replay-view.js','forecast-replay.js','forecast-replay-sources.js'])assert(Object.hasOwn(imports,'@atlas/'+id));
    assert.deepEqual(Object.keys(archive.archives).sort(),Object.keys(REPLAY_ARCHIVE_PATHS).sort());
    for(const [symbol,archivePath]of Object.entries(REPLAY_ARCHIVE_PATHS)){
      const raw=await readFile(resolve(root,'dist',archivePath),'utf8');
      assert.equal(archive.archives[symbol].archivePath,archivePath);
      assert.equal(archive.archives[symbol].sourceText,raw,symbol+' exact UTF-8 source survives HTML embedding');
      assert.equal(archive.archives[symbol].sourceHash,sha(raw));
      const expected=await parseReplayPriceArchive(symbol,raw,{archivePath});
      assert.equal(runtime.prices[symbol].jsonHash,sha(JSON.stringify(expected)),symbol+' packaged loader equals source parser');
    }
    assert.equal(archive.archives.ETHUSD.archivePath,'data/replay-eth-ohlc.json');
    assert.notEqual(archive.archives.ETHUSD.sourceText,await readFile(resolve(root,'dist/data/eth-ohlc.json'),'utf8'));
    assert.equal(runtime.networkCalls,0);
  });

  test('packaged ETH, MSTR and BMNR journals verify their real frozen records and replay offline',async()=>{
    const index=JSON.parse(await readFile(resolve(root,'dist/data/asset-forecast-ledger/index.json'),'utf8'));
    assert.deepEqual(assetArchive.index,index);
    for(const symbol of ['ETHUSD','MSTR','BMNR']){
      const entries=index.entries.filter(entry=>entry.symbol===symbol)
        .sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.scenario.localeCompare(b.scenario)||a.id.localeCompare(b.id));
      const entry=entries.find(item=>item.scenario==='base')||entries[0];
      const record=JSON.parse(await readFile(resolve(root,'dist/data/asset-forecast-ledger',entry.recordPath),'utf8'));
      const snapshot=JSON.parse(await readFile(resolve(root,'dist/data/asset-forecast-ledger',entry.snapshotPath),'utf8'));
      assert.equal(runtime.records[symbol].recordHash,sha(JSON.stringify(record)));
      assert.equal(runtime.records[symbol].snapshotHash,sha(JSON.stringify(snapshot)));
      assert.equal(runtime.records[symbol].outputHash,record.outputHash);
    }
    assert.ok(runtime.records.ETHUSD.matchedCount>0,'dedicated ETH outcome archive has actual post-issue comparisons');
    assert.equal(runtime.records.ETHUSD.visibleActualThrough,runtime.prices.ETHUSD.observedThrough);
    assert.equal(runtime.networkCalls,0);
  });

  test('embedded replay rejects missing or altered outcome bytes instead of substituting older ETH',async t=>{
    let current=structuredClone(archive),networkCalls=0;
    const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
    Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:id=>id==='atlas-replay-price-archives'?{textContent:JSON.stringify(current)}:
      id==='embedded-eth-data'?{textContent:embedded(html,id)}:null}});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
    const fetchImpl=async()=>{networkCalls++;throw new Error('unexpected network fallback');};
    current.archives.ETHUSD.sourceText+='\n';
    await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl}),/hash mismatch/);
    delete current.archives.ETHUSD;
    await assert.rejects(loadReplayPriceArchive('ETHUSD',{fetchImpl}),/Missing or invalid embedded replay archive/);
    assert.equal(networkCalls,0);
    let requested;
    const raw=await readFile(resolve(root,'dist/data/eth-ohlc.json'),'utf8');
    const overridden=await loadReplayPriceArchive('ETHUSD',{archivePath:'data/eth-ohlc.json',fetchImpl:async path=>{
      requested=path;return new Response(raw);
    }});
    assert.equal(requested,'data/eth-ohlc.json','an explicit source override preserves the existing fetch behavior');
    assert.equal(overridden.source.sourceHash,sha(raw));
  });

  test('offline journal verifies every indexed record, including an unselected asset, before exposing data',async()=>{
    const altered=structuredClone(assetArchive);
    const other=Object.values(altered.records).find(record=>record.symbol==='MSTR');
    other.output.path[1][1]+=1;
    let networkCalls=0;
    const states=[],loader=createAssetJournalLoader({baseUrl:'file:///offline.html',embeddedArchive:()=>JSON.stringify(altered),
      fetchImpl:async()=>{networkCalls++;throw new Error('unexpected network fallback');},onState:state=>states.push(state)});
    const result=await loader.load({symbol:'ETHUSD'});
    assert.equal(result,null);
    assert.equal(states.at(-1).status,'error');
    assert.match(states.at(-1).message,/hash|identity/i);
    assert.equal(networkCalls,0);
    loader.cancel();
  });

  test('a superseded offline verification cannot replace the current asset selection',async()=>{
    const states=[],loader=createAssetJournalLoader({baseUrl:'file:///offline.html',embeddedArchive:()=>embedded(html,'atlas-asset-forecast-ledger'),
      fetchImpl:async()=>{throw new Error('unexpected network');},onState:state=>states.push(state)});
    const first=loader.load({symbol:'ETHUSD'}),second=loader.load({symbol:'MSTR'});
    assert.equal(await first,null);
    assert.equal((await second)?.symbol,'MSTR');
    assert.deepEqual(states.filter(state=>state.status==='ready').map(state=>state.symbol),['MSTR']);
    loader.cancel();
  });
}
