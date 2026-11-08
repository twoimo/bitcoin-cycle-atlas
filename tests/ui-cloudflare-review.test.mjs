import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createUiReviewLogFilter,readUiReviewScreenshot,selectUiReviewScreenshots} from '../scripts/verify-ui-cloudflare.mjs';

test('phase transport removes split raw evidence lines without losing native case failures',()=>{
  const lines=[],filter=createUiReviewLogFilter(line=>lines.push(line));
  filter.write('ETH_BROWSER_RE');filter.write('PORT_CHUNK {"name":"report.json"}\nETH_BROWSER_CASE {"status":"failed"}\nETH_BROWSER_RECE');
  filter.write('IPT {"status":"failed"}\r\nChrome stderr: native input failed');filter.flush();
  assert.deepEqual(lines,['ETH_BROWSER_CASE {"status":"failed"}','Chrome stderr: native input failed']);
});

test('curated native screenshots retain six sizes and every failure but no redundant replay-entry pictures',()=>{
  const images=['wp4-after-320x740-chart.png','wp4-after-320x740-replay.png','wp4-after-320x740-replay-entry.png',
    'wp4-after-390x844-legend.png','wp4-after-768x1024-legend.png','wp4-after-1440x900-legend.png',
    'wp4-before-1920x1080-chart.png','ui-contract-tqqq-1440-failure.png','ui-contract-btc-320-failure.png'];
  const report={cases:[{screenshots:images.map(file=>({file,bytes:10,sha256:'a'.repeat(64)}))}]};
  assert.deepEqual(selectUiReviewScreenshots(report,'after').map(item=>item.file),[
    images[0],images[1],images[3],images[5],images[7],images[8],
  ]);
});

test('screenshot transport rejects changed original bytes and paths outside the phase directory',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-ui-evidence-'));
  try{
    const bytes=Buffer.from('original native PNG bytes'),file='wp4-before-320x740-chart.png';
    await writeFile(resolve(directory,file),bytes);
    const receipt={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
    assert.deepEqual(await readUiReviewScreenshot(directory,receipt),bytes);
    await assert.rejects(readUiReviewScreenshot(directory,{...receipt,file:'../outside.png'}),/escapes/);
    await writeFile(resolve(directory,file),Buffer.from('modified native PNG bytes'));
    await assert.rejects(readUiReviewScreenshot(directory,receipt),/bytes changed/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
