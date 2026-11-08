import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {browserEvidenceChunks,decodeBrowserEvidenceChunks,emitCompressedBrowserReport} from '../scripts/browser-evidence-transport.mjs';

const script=fileURLToPath(new URL('../scripts/ui-review-log-filter.cjs',import.meta.url));
const artifacts=new URL('../docs/ui-review-20261108/native-4acab/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',artifacts),'utf8'));
const imagePrefix=Buffer.from('ETH_BROWSER_IMAGE_CHUNK '),filterPrefix=Buffer.from('ATLAS_UI_PNG_FILTER_');
const starts=(line,prefix)=>line.subarray(0,prefix.length).equals(prefix);
function lines(bytes){
  const result=[];let start=0,end;
  while((end=bytes.indexOf(10,start))!==-1){result.push(bytes.subarray(start,end+1));start=end+1;}
  if(start<bytes.length)result.push(bytes.subarray(start));return result;
}
const encode=chunks=>Buffer.from(chunks.map(chunk=>'ETH_BROWSER_IMAGE_CHUNK '+JSON.stringify(chunk)+'\n').join(''));
const image=(name,bytes=readFileSync(new URL(name,artifacts)))=>browserEvidenceChunks(bytes,{name});
const run=input=>spawnSync(process.execPath,[script],{input,maxBuffer:64*1024*1024});
function marker(output,event){
  const prefix=Buffer.from('ATLAS_UI_PNG_FILTER_'+event+' '),found=lines(output).filter(line=>starts(line,prefix));
  assert.equal(found.length,1,event+' must occur exactly once');return JSON.parse(found[0].subarray(prefix.length));
}
const otherBytes=bytes=>Buffer.concat(lines(bytes).filter(line=>!starts(line,imagePrefix)&&!starts(line,filterPrefix)));
function outputImages(output){
  const groups=new Map();
  for(const raw of lines(output).filter(line=>starts(line,imagePrefix))){
    const chunk=JSON.parse(raw.subarray(imagePrefix.length));if(!groups.has(chunk.name))groups.set(chunk.name,[]);groups.get(chunk.name).push(chunk);
  }
  return groups;
}

test('v2 sends all 13 original after PNGs and omits only six byte-identical preserved before PNGs',()=>{
  assert.equal(manifest.pngs.length,19);
  const compressed=[];
  emitCompressedBrowserReport(readFileSync(new URL('ui-review-after/report.json',artifacts)),{name:'ui-review-after/report.json',log:line=>compressed.push(Buffer.from(line+'\n'))});
  const receipt=Buffer.from('ETH_BROWSER_CASE {"status":"failed","error":"원본 진단·오류 보존"}\r\nATLAS_UI_REVIEW_DIAGNOSTIC {"status":"passed","cases":27}\n');
  const input=Buffer.concat([receipt,...compressed,...manifest.pngs.map(item=>encode(image(item.name))),Buffer.from('ATLAS_UI_REVIEW_IMAGES_COMPLETE {"images":19}\n')]);
  const result=run(input);assert.equal(result.status,0,result.stderr.toString());
  const start=marker(result.stdout,'START'),complete=marker(result.stdout,'COMPLETE'),groups=outputImages(result.stdout);
  assert.equal(start.version,2);assert.equal(start.conditionalOmissions.length,6);assert.equal(complete.version,2);
  assert.deepEqual([complete.inputPngs,complete.keptPngs,complete.omittedPngs],[19,13,6]);
  assert.deepEqual(complete.missingExpectedKeptImageNames,[]);assert.equal(groups.size,13);
  assert.deepEqual(otherBytes(result.stdout),otherBytes(input),'Every report, case, error and wrapper receipt byte must pass unchanged');
  assert.equal(complete.passedOtherBytes,otherBytes(input).length);
  const expectedKept=lines(input).filter(line=>starts(line,imagePrefix)&&JSON.parse(line.subarray(imagePrefix.length)).name.startsWith('ui-review-after/'));
  assert.deepEqual(Buffer.concat(lines(result.stdout).filter(line=>starts(line,imagePrefix))),Buffer.concat(expectedKept),'Forwarded PNG chunk lines stay byte-identical');
  for(const item of manifest.pngs){
    const original=readFileSync(new URL(item.name,artifacts));
    if(item.name.startsWith('ui-review-after/'))assert.deepEqual(decodeBrowserEvidenceChunks(groups.get(item.name),{name:item.name,expectedBytes:item.bytes,expectedSha256:item.sha256}),original);
    else{
      assert.equal(groups.has(item.name),false);
      const verified=complete.verifiedOriginalImages.find(entry=>entry.name===item.name);
      assert.equal(verified.kept,false);assert.equal(verified.bytes,item.bytes);assert.equal(verified.sha256,item.sha256);
      assert.equal(verified.omissionReason,'exact preserved before PNG');
      assert.equal(verified.preservedArtifact,'docs/ui-review-20261108/native-4acab/'+item.name);
    }
  }
});

test('changed before bytes, unknown before names and every unexpected or failure PNG are forwarded',()=>{
  const name='ui-review-before/wp4-before-320x740-chart.png',original=readFileSync(new URL(name,artifacts)),changed=Buffer.from(original);
  changed[changed.length-1]^=1; // Deliberately altered transport bytes, not a new browser screenshot.
  for(const replacement of [changed,readFileSync(new URL('ui-review-before/wp4-before-390x844-chart.png',artifacts))]){
    const names=[name,'ui-review-before/unexpected-chart.png','ui-review-after/failure-chart.png','ui-review-after/unplanned-chart.png'];
    const input=Buffer.concat(names.map(item=>encode(image(item,item===name?replacement:original))));
    const result=run(input);assert.equal(result.status,0,result.stderr.toString());
    const complete=marker(result.stdout,'COMPLETE');assert.deepEqual([complete.inputPngs,complete.keptPngs,complete.omittedPngs],[4,4,0]);
    assert.deepEqual(Buffer.concat(lines(result.stdout).filter(line=>starts(line,imagePrefix))),input);
  }
});

test('malformed, incomplete, duplicate, mixed or corrupt image streams fail without a completion receipt',()=>{
  const chunks=image('ui-review-before/wp4-before-320x740-chart.png'),corrupt=structuredClone(chunks);
  corrupt[0].data=(corrupt[0].data[0]==='A'?'B':'A')+corrupt[0].data.slice(1);
  const inputs=[Buffer.from('ETH_BROWSER_IMAGE_CHUNK {broken JSON}\n'),encode(chunks.slice(0,1)),encode([chunks[0],chunks[0]]),
    encode([chunks[0],{...chunks[1],sha256:'a'.repeat(64)}]),encode(corrupt)];
  for(const input of inputs){
    const result=run(input);assert.equal(result.status,1);assert.match(result.stderr.toString(),/ATLAS_UI_PNG_FILTER_ERROR/);
    assert.equal(lines(result.stdout).some(line=>starts(line,Buffer.from('ATLAS_UI_PNG_FILTER_COMPLETE '))),false);
  }
});

test('bash pipefail retains the original wrapper exit code even after the filter drains successfully',()=>{
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const source='process.stdout.write("WRAPPER_RECEIPT {\\"status\\":\\"failed\\"}\\n");process.exitCode=7;';
  const command=quote(process.execPath)+' -e '+quote(source)+' | '+quote(process.execPath)+' '+quote(script);
  const result=spawnSync('bash',['-o','pipefail','-c',command],{maxBuffer:1024*1024});
  assert.equal(result.status,7,result.stderr.toString());
  assert.equal(marker(result.stdout,'COMPLETE').version,2);
  assert.deepEqual(otherBytes(result.stdout),Buffer.from('WRAPPER_RECEIPT {"status":"failed"}\n'));
});
