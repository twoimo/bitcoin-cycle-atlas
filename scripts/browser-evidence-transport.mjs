import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const browserEvidenceChunkSize=4096;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const prefixes=new Set(['ETH_BROWSER_IMAGE_CHUNK','ETH_BROWSER_REPORT_CHUNK']);

/** Transport the original artifact bytes through bounded build-log lines. */
export function browserEvidenceChunks(bytes,{name}={}){
  assert.ok(bytes instanceof Uint8Array,'Evidence must be the original artifact bytes');
  assert.equal(typeof name,'string');assert.ok(name.length>0&&name.length<256,'An artifact name is required');
  const original=Buffer.from(bytes),encoded=original.toString('base64'),total=Math.max(1,Math.ceil(encoded.length/browserEvidenceChunkSize));
  const metadata={schemaVersion:1,name,bytes:original.length,sha256:digest(original),total};
  return Array.from({length:total},(_,index)=>({...metadata,index,data:encoded.slice(index*browserEvidenceChunkSize,(index+1)*browserEvidenceChunkSize)}));
}

export function emitBrowserEvidenceChunks(prefix,bytes,{name,log=console.log}={}){
  assert.ok(prefixes.has(prefix),'Unknown browser evidence prefix');
  const chunks=browserEvidenceChunks(bytes,{name});
  for(const chunk of chunks)log(prefix+' '+JSON.stringify(chunk));
  return {name,bytes:chunks[0].bytes,sha256:chunks[0].sha256,total:chunks.length};
}

/** Reject incomplete, mixed, duplicate or corrupted log evidence. Arrival order
 * may differ across paginated log reads; artifact order is carried by index. */
export function decodeBrowserEvidenceChunks(chunks,{name,expectedBytes,expectedSha256}={}){
  assert.ok(Array.isArray(chunks)&&chunks.length>0,'Evidence chunks are missing');
  const first=chunks[0];assert.equal(first.schemaVersion,1);
  assert.equal(typeof first.name,'string');assert.ok(first.name.length>0&&first.name.length<256);
  assert.ok(Number.isSafeInteger(first.bytes)&&first.bytes>=0);assert.match(first.sha256??'',/^[a-f0-9]{64}$/);
  const encodedLength=Math.ceil(first.bytes/3)*4,expectedTotal=Math.max(1,Math.ceil(encodedLength/browserEvidenceChunkSize));
  assert.equal(first.total,expectedTotal);assert.equal(chunks.length,expectedTotal,'Evidence chunk inventory is incomplete');
  if(name!==undefined)assert.equal(first.name,name,'Evidence belongs to another artifact');
  if(expectedBytes!==undefined)assert.equal(first.bytes,expectedBytes,'Evidence byte count differs from its receipt');
  if(expectedSha256!==undefined)assert.equal(first.sha256,expectedSha256,'Evidence digest differs from its receipt');
  const ordered=new Array(expectedTotal);
  for(const chunk of chunks){
    for(const key of ['schemaVersion','name','bytes','sha256','total'])assert.equal(chunk[key],first[key],'Mixed evidence metadata: '+key);
    assert.ok(Number.isSafeInteger(chunk.index)&&chunk.index>=0&&chunk.index<expectedTotal,'Invalid evidence chunk index');
    assert.equal(ordered[chunk.index],undefined,'Duplicate evidence chunk index');
    assert.equal(typeof chunk.data,'string');
    assert.equal(chunk.data.length,Math.min(browserEvidenceChunkSize,encodedLength-chunk.index*browserEvidenceChunkSize),'Truncated evidence chunk');
    assert.equal(Buffer.from(chunk.data,'base64').toString('base64'),chunk.data,'Invalid base64 evidence');
    ordered[chunk.index]=chunk.data;
  }
  const bytes=Buffer.from(ordered.join(''),'base64');
  assert.equal(bytes.length,first.bytes,'Decoded evidence size mismatch');assert.equal(digest(bytes),first.sha256,'Decoded evidence hash mismatch');
  return bytes;
}

/** A suite report retains every observation. Compression changes transport
 * bytes only; both representations carry independent size/hash receipts. */
export function emitCompressedBrowserReport(bytes,{name='report.json',log=console.log}={}){
  assert.ok(bytes instanceof Uint8Array,'Evidence must be the original artifact bytes');
  const original=Buffer.from(bytes),encoded=gzipSync(original,{level:9});
  const originalMetadata={contentEncoding:'gzip',originalName:name,originalBytes:original.length,originalSha256:digest(original)};
  const chunks=browserEvidenceChunks(encoded,{name:name+'.gz'}).map(chunk=>({...chunk,...originalMetadata}));
  for(const chunk of chunks)log('ETH_BROWSER_REPORT_CHUNK '+JSON.stringify(chunk));
  return {name:chunks[0].name,bytes:encoded.length,sha256:digest(encoded),total:chunks.length,...originalMetadata};
}

export function decodeCompressedBrowserReport(chunks,{name,expectedBytes,expectedSha256,expectedEncodedBytes,expectedEncodedSha256}={}){
  assert.ok(Array.isArray(chunks)&&chunks.length>0,'Compressed report chunks are missing');
  const first=chunks[0];assert.equal(first.contentEncoding,'gzip');
  assert.equal(typeof first.originalName,'string');assert.ok(first.originalName.length>0);
  assert.equal(first.name,first.originalName+'.gz');
  assert.ok(Number.isSafeInteger(first.originalBytes)&&first.originalBytes>=0);
  assert.match(first.originalSha256??'',/^[a-f0-9]{64}$/);
  for(const chunk of chunks)for(const key of ['contentEncoding','originalName','originalBytes','originalSha256'])
    assert.equal(chunk[key],first[key],'Mixed compressed report metadata: '+key);
  if(name!==undefined)assert.equal(first.originalName,name,'Decoded report belongs to another artifact');
  if(expectedBytes!==undefined)assert.equal(first.originalBytes,expectedBytes,'Decoded report byte count differs from its receipt');
  if(expectedSha256!==undefined)assert.equal(first.originalSha256,expectedSha256,'Decoded report digest differs from its receipt');
  const encoded=decodeBrowserEvidenceChunks(chunks,{name:first.name,expectedBytes:expectedEncodedBytes,expectedSha256:expectedEncodedSha256});
  const original=gunzipSync(encoded,{maxOutputLength:Math.max(1,first.originalBytes)});
  assert.equal(original.length,first.originalBytes,'Decoded report size mismatch');
  assert.equal(digest(original),first.originalSha256,'Decoded report hash mismatch');
  return original;
}
