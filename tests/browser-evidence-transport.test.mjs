import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {browserEvidenceChunks,emitBrowserEvidenceChunks,decodeBrowserEvidenceChunks,browserEvidenceChunkSize,emitCompressedBrowserReport,decodeCompressedBrowserReport} from '../scripts/browser-evidence-transport.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('bounded image/report log chunks recover exact original bytes and receipt hashes in any arrival order',()=>{
  const syntheticPngBytes=Buffer.from(Array.from({length:100003},(_,index)=>index%256));
  const fixtureReportBytes=Buffer.from(JSON.stringify({status:'FAIL',sourceCommit:'a'.repeat(40),cases:Array.from({length:53},(_,index)=>({index,chartZoom:{before:{start:18000+index,end:19000+index},after:{start:18100+index,end:19000+index}},error:index===3?'닫기 이벤트 재개방 검증':'',padding:'source-bound '.repeat(120)}))},null,2)+'\n');
  for(const [prefix,name,bytes] of [['ETH_BROWSER_IMAGE_CHUNK','fixture-failure.png',syntheticPngBytes],['ETH_BROWSER_REPORT_CHUNK','report.json',fixtureReportBytes]]){
    const lines=[],receipt=emitBrowserEvidenceChunks(prefix,bytes,{name,log:line=>lines.push(line)});
    assert.ok(lines.length>4);const chunks=lines.map(line=>{assert.ok(line.startsWith(prefix+' '));return JSON.parse(line.slice(prefix.length+1));});
    assert.equal(receipt.bytes,bytes.length);assert.equal(receipt.sha256,hash(bytes));assert.equal(receipt.total,chunks.length);
    assert.ok(chunks.every(chunk=>chunk.data.length<=4096&&Buffer.byteLength(JSON.stringify(chunk))<5000));
    assert.equal(browserEvidenceChunkSize,4096);assert.equal(chunks.map(chunk=>chunk.data).join(''),bytes.toString('base64'));
    const restored=decodeBrowserEvidenceChunks([...chunks].reverse(),{name,expectedBytes:bytes.length,expectedSha256:hash(bytes)});
    assert.deepEqual(restored,bytes);assert.equal(hash(restored),receipt.sha256);
  }
});

test('evidence decoding rejects omitted, duplicate, mixed, truncated and corrupted chunks',()=>{
  const bytes=Buffer.from('exact preserved evidence\n'.repeat(2000)),original=browserEvidenceChunks(bytes,{name:'report.json'});
  const rejected=mutate=>{const changed=structuredClone(original);mutate(changed);assert.throws(()=>decodeBrowserEvidenceChunks(changed));};
  rejected(chunks=>chunks.splice(1,1));
  rejected(chunks=>{chunks[1]=chunks[0];});
  rejected(chunks=>{chunks[1].sha256='b'.repeat(64);});
  rejected(chunks=>{chunks[1].name='another-run.json';});
  rejected(chunks=>{chunks[1].data=chunks[1].data.slice(0,-4);});
  rejected(chunks=>{chunks[1].data='!!!!'+chunks[1].data.slice(4);});
  rejected(chunks=>{chunks[1].data=(chunks[1].data[0]==='A'?'B':'A')+chunks[1].data.slice(1);});
  assert.throws(()=>decodeBrowserEvidenceChunks(original,{expectedSha256:'c'.repeat(64)}),/digest differs/);
  assert.throws(()=>decodeBrowserEvidenceChunks(original,{expectedBytes:bytes.length+1}),/byte count differs/);
});

test('compressed aggregate report transport preserves every original byte and verifies both hash layers',()=>{
  const report=Buffer.from(JSON.stringify({fixture:true,cases:Array.from({length:53},(_,index)=>({index,states:Array.from({length:42},(_,frame)=>({frame,date:'2026-11-07',label:'실제 관측 보존',path:'M0 0L1 1'.repeat(80)}))}))},null,2)+'\n');
  const lines=[],receipt=emitCompressedBrowserReport(report,{log:line=>lines.push(line)});
  assert.ok(receipt.bytes<report.length/10,'Transport must compress the repeated report, not omit its states');
  assert.equal(receipt.originalBytes,report.length);assert.equal(receipt.originalSha256,hash(report));
  const chunks=lines.map(line=>JSON.parse(line.slice('ETH_BROWSER_REPORT_CHUNK '.length)));
  assert.ok(chunks.length>1);assert.ok(chunks.every(chunk=>chunk.data.length<=4096&&Buffer.byteLength(JSON.stringify(chunk))<5000));
  assert.deepEqual(decodeCompressedBrowserReport([...chunks].reverse(),{name:'report.json',expectedBytes:report.length,expectedSha256:hash(report),expectedEncodedBytes:receipt.bytes,expectedEncodedSha256:receipt.sha256}),report);
  const rejected=mutate=>{const changed=structuredClone(chunks);mutate(changed);assert.throws(()=>decodeCompressedBrowserReport(changed));};
  rejected(chunks=>chunks.pop());
  rejected(chunks=>{chunks[1]=chunks[0];});
  rejected(chunks=>{chunks[0].originalSha256='0'.repeat(64);});
  rejected(chunks=>{for(const chunk of chunks)chunk.originalSha256='0'.repeat(64);});
  rejected(chunks=>{for(const chunk of chunks)chunk.originalBytes--;});
  rejected(chunks=>{chunks[0].data=(chunks[0].data[0]==='A'?'B':'A')+chunks[0].data.slice(1);});
  assert.throws(()=>decodeCompressedBrowserReport(chunks,{expectedEncodedSha256:'f'.repeat(64)}));
  assert.throws(()=>decodeCompressedBrowserReport(chunks,{expectedSha256:'f'.repeat(64)}));
});
