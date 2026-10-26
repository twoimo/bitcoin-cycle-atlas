import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {decideAssetAppend,assetFileIdentity,assetSnapshotTransport,emitAssetForecastFiles} from '../scripts/issue-asset-forecasts.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const encoded=value=>canonicalForecastJson(value)+'\n';
function candidate(overrides={}){
  return {id:'a'.repeat(64),runKey:'b'.repeat(64),outputHash:'c'.repeat(64),
    snapshotDataHash:'d'.repeat(64),symbol:'BMNR',asOf:'2026-10-23',scenario:{id:'base'},
    issuedAt:'2026-10-26T08:00:00.000Z',recordKind:'issued',
    model:{sourceHash:'e'.repeat(64),version:'treasury-asset-linked-daily-1'},
    options:{endYear:2035,seed:20261022,capitalPolicy:'cash-at-put'},
    targets:[{horizonDays:30},{horizonDays:90},{horizonDays:180}],...overrides};
}
test('asset collector reruns keep the first issue and reject same-run output drift',()=>{
  const original=candidate(),before=encoded(original);
  const rerun=candidate({id:'f'.repeat(64),issuedAt:'2026-10-26T09:00:00.000Z'});
  const decision=decideAssetAppend([original],rerun);
  assert.equal(decision.action,'reuse');
  assert.equal(decision.record,original);
  assert.equal(decision.record.issuedAt,'2026-10-26T08:00:00.000Z');
  assert.equal(encoded(original),before);
  assert.throws(()=>decideAssetAppend([original],{...rerun,outputHash:'0'.repeat(64)}),/different output hash/);
});
test('asset collector revisions name the latest same-origin scenario and preserve predecessor bytes',()=>{
  const original=candidate();
  const last=candidate({id:'1'.repeat(64),runKey:'2'.repeat(64),issuedAt:'2026-10-26T08:10:00.000Z'});
  const unrelated=candidate({id:'3'.repeat(64),asOf:'2026-10-22',issuedAt:'2026-10-26T08:20:00.000Z'});
  const records=[unrelated,last,original],before=encoded(records);
  const changed=candidate({id:'4'.repeat(64),runKey:'5'.repeat(64),snapshotDataHash:'6'.repeat(64),issuedAt:'2026-10-26T09:00:00.000Z'});
  const decision=decideAssetAppend(records,changed);
  assert.equal(decision.action,'append');
  assert.equal(decision.replaces,last.id);
  assert.match(decision.revisionReason,/preserved input bytes/);
  assert.equal(encoded(records),before);
  const modelChange={...changed,snapshotDataHash:original.snapshotDataHash,model:{...original.model,sourceHash:'7'.repeat(64)}};
  assert.match(decideAssetAppend(records,modelChange).revisionReason,/committed model source/);
  assert.throws(()=>decideAssetAppend([original],{...original,runKey:'8'.repeat(64)}),/Unexplained/);
});
function transportFixture(){
  const raw='{"review":"한국어 · preserved bytes · 🙂"}\r\n';
  const sourcePath='research-data/treasury-bmnr.json',commit='a'.repeat(40),id='9'.repeat(64);
  const snapshot={kind:'atlas-asset-forecast-snapshot',schemaVersion:1,id,
    informationClock:{inputs:[{id:'treasury-research',sourceHash:sha(raw),
      sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+commit+'/'+sourcePath}]},
    inputs:{sourceDocuments:{'treasury-research':raw},sourcePaths:{'treasury-research':sourcePath},
      marker:'x'.repeat(11999)+'🙂'.repeat(7000)},
  };
  return {raw,sourcePath,commit,path:'snapshots/'+id+'.json',snapshot,text:encoded(snapshot)};
}
test('snapshot log transport hydrates byte-exact original UTF-8 and Git blob identity across chunks',()=>{
  const fixture=transportFixture(),lines=[];
  const recordText='{"note":"'+('z'.repeat(11999)+'🙂'.repeat(3000))+'"}\n';
  emitAssetForecastFiles(new Map([[fixture.path,fixture.text],['records/example.json',recordText]]),line=>lines.push(line));
  const manifest=JSON.parse(lines.find(line=>line.startsWith('ASSET_FORECAST_FILE_MANIFEST ')).slice('ASSET_FORECAST_FILE_MANIFEST '.length));
  assert.deepEqual(manifest.files.find(file=>file.path===fixture.path),{path:fixture.path,...assetFileIdentity(fixture.text)});
  const parsed=lines.filter(line=>line.startsWith('ASSET_FORECAST_SNAPSHOT_TRANSPORT_CHUNK '))
    .map(line=>JSON.parse(line.slice('ASSET_FORECAST_SNAPSHOT_TRANSPORT_CHUNK '.length)));
  assert.ok(parsed.length>1);
  assert.equal(parsed[0].total,parsed.length);
  assert.ok(parsed.every(row=>row.text.length<=12000));
  assert.ok(parsed.every((row,index)=>row.part===index));
  const transportText=parsed.map(row=>row.text).join('');
  assert.equal(sha(transportText),parsed[0].transportSha256);
  const transport=JSON.parse(transportText);
  assert.equal(transport.kind,'atlas-asset-snapshot-transport');
  assert.equal(Object.hasOwn(transport.snapshotTemplate.inputs,'sourceDocuments'),false);
  assert.deepEqual(transport.sourceDocumentRefs['treasury-research'],{
    gitSourceCommit:fixture.commit,path:fixture.sourcePath,sha256:sha(fixture.raw),bytes:Buffer.byteLength(fixture.raw,'utf8'),
  });
  const hydrated=structuredClone(transport.snapshotTemplate);
  hydrated.inputs.sourceDocuments={'treasury-research':fixture.raw};
  const fullText=encoded(hydrated);
  assert.equal(fullText,fixture.text);
  assert.deepEqual(assetFileIdentity(fullText),transport.originalFile);
  const rawRecord=lines.filter(line=>line.startsWith('ASSET_FORECAST_FILE_CHUNK '))
    .map(line=>JSON.parse(line.slice('ASSET_FORECAST_FILE_CHUNK '.length)));
  assert.equal(rawRecord.map(row=>row.text).join(''),recordText);
  assert.equal(sha(recordText),rawRecord[0].sha256);
});
test('snapshot transport cannot disguise modified source bytes or normalize immutable formatting',()=>{
  const fixture=transportFixture();
  const mutated=structuredClone(fixture.snapshot);
  mutated.inputs.sourceDocuments['treasury-research']+=' ';
  assert.throws(()=>assetSnapshotTransport(fixture.path,encoded(mutated)),/source hash mismatch/);
  assert.equal(assetSnapshotTransport(fixture.path,JSON.stringify(fixture.snapshot,null,2)+'\n'),null);
  const external=structuredClone(fixture.snapshot);
  external.informationClock.inputs[0].sourceUrl='https://example.org/treasury.json';
  assert.equal(assetSnapshotTransport(fixture.path,encoded(external)),null);
});
