import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createUiReviewLogFilter,emitUiReviewArtifacts,planUiReviewScreenshots,readUiReviewScreenshot,screenshotLogBytes,selectUiReviewScreenshots,uiReviewHarnessFiles,uiReviewScreenshotBudgets} from '../scripts/verify-ui-cloudflare.mjs';
import {decodeCompressedBrowserReport,emitBrowserEvidenceChunks} from '../scripts/browser-evidence-transport.mjs';
import {uiReviewVerifierFiles} from '../scripts/browser-source-identity.mjs';

const sizes=['320x740','390x844','768x1024','1024x768','1440x900','1920x1080'];
const chartFiles=phase=>sizes.map(size=>`wp4-${phase}-${size}-chart.png`);
const nativeFiles=['ui-entry-mstr-root-1440x900.png','ui-entry-bmnr-root-1440x900.png'];
const legendFiles=['320x740','390x844','1440x900'].map(size=>`wp4-after-${size}-legend.png`);
const replayFiles=['1440x900','1920x1080'].map(size=>`wp4-after-${size}-replay.png`);
const reportFor=(files,bytes=100)=>({status:'passed',cases:[{status:'passed',screenshots:files.map(file=>({file,bytes,sha256:'a'.repeat(64)}))}]});

test('the isolated baseline copies only the declared verifier modules and links the native runner policy imports',async()=>{
  assert.equal(uiReviewHarnessFiles,uiReviewVerifierFiles,'baseline copying and source hashing must share one dependency inventory');
  assert.deepEqual(uiReviewHarnessFiles,[
    'scripts/verify-eth-candidate-browser.mjs','scripts/verify-ui-contract-browser.mjs',
    'scripts/browser-source-identity.mjs','scripts/btc-offline-refresh-policy.mjs',
  ]);
  assert.ok(uiReviewHarnessFiles.every(file=>file.startsWith('scripts/')&&file.endsWith('.mjs')),'application and market data cannot be copied into the baseline');
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-ui-verifier-link-'));
  try{
    for(const file of uiReviewHarnessFiles){
      const target=resolve(directory,file);await mkdir(dirname(target),{recursive:true});
      await copyFile(new URL('../'+file,import.meta.url),target);
    }
    const runner=await readFile(resolve(directory,'scripts/verify-eth-candidate-browser.mjs'),'utf8');
    const declaration=runner.match(/import\s*\{[^}]+\}\s*from\s*(['"])\.\/btc-offline-refresh-policy\.mjs\1\s*;/)?.[0];
    assert.ok(declaration,'the actual native runner must declare its offline-policy imports');
    const shim=resolve(directory,'scripts/verifier-policy-link.mjs');
    await writeFile(shim,declaration+'\nexport * from "./btc-offline-refresh-policy.mjs";\n');
    const linked=await import(pathToFileURL(shim).href);
    for(const name of ['ownsOfflineBtcPriceReadout','offlineBtcRefreshSurface','isExpectedOfflineBtcRefresh'])assert.equal(typeof linked[name],'function');
    assert.equal(linked.ownsOfflineBtcPriceReadout({page:'outlook',center:'housing'}),false);
    assert.equal(linked.ownsOfflineBtcPriceReadout({page:'outlook'}),true);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('phase transport removes split raw evidence lines without losing native case failures',()=>{
  const lines=[],filter=createUiReviewLogFilter(line=>lines.push(line));
  filter.write('ETH_BROWSER_RE');filter.write('PORT_CHUNK {"name":"report.json"}\nETH_BROWSER_CASE {"status":"failed"}\nETH_BROWSER_RECE');
  filter.write('IPT {"status":"failed"}\r\nChrome stderr: native input failed');filter.flush();
  assert.deepEqual(lines,['ETH_BROWSER_CASE {"status":"failed"}','Chrome stderr: native input failed']);
});

test('bounded screenshots prioritize six charts, native roots, key legends and desktop replay while retaining failures',()=>{
  const failure='ui-contract-btc-320-failure.png';
  const before=reportFor([...chartFiles('before'),'wp4-before-1440x900-replay.png',failure]);
  assert.deepEqual(selectUiReviewScreenshots(before,'before').map(item=>item.file),[...chartFiles('before'),failure]);
  const omitted=['wp4-after-320x740-replay.png','wp4-after-390x844-replay-picking.png','ui-entry-bmnr-charts-1440x900.png'];
  const after=reportFor([...replayFiles,...legendFiles,...nativeFiles,...chartFiles('after'),failure,...omitted]);
  assert.deepEqual(selectUiReviewScreenshots(after,'after').map(item=>item.file),[...chartFiles('after'),failure,...nativeFiles,...legendFiles,...replayFiles]);
  const plan=planUiReviewScreenshots(after,'after');assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.omitted.map(item=>item.file),omitted);
  assert.equal(plan.omitted.at(-1).representativeFile,'ui-entry-bmnr-root-1440x900.png');
  assert.ok(plan.omitted.every(item=>item.reason));
  assert.ok(uiReviewScreenshotBudgets.before.pngBytes+uiReviewScreenshotBudgets.after.pngBytes<=3_500_000);
  assert.ok(uiReviewScreenshotBudgets.before.logBytes+uiReviewScreenshotBudgets.after.logBytes<=5_000_000);
});

test('transport budgets omit optional states explicitly and fail when a required or failure image cannot fit',()=>{
  const failure='ui-shell-housing-1440-failure.png',report=reportFor([...chartFiles('after'),...nativeFiles,...legendFiles,...replayFiles,failure]);
  const plan=planUiReviewScreenshots(report,'after',{pngBytes:1000,logBytes:1_000_000});
  assert.equal(plan.pngBytes,1000);assert.deepEqual(plan.errors,[]);
  for(const file of [...chartFiles('after'),...nativeFiles,failure])assert.ok(plan.selected.some(item=>item.file===file));
  assert.ok(plan.omitted.length>0);assert.ok(plan.omitted.every(item=>item.reason.includes('budget')));
  const tooSmall=planUiReviewScreenshots(report,'after',{pngBytes:500,logBytes:1_000_000});
  assert.ok(tooSmall.pngBytes<=500);assert.ok(tooSmall.errors.some(error=>error.includes(chartFiles('after').at(-1))));
  assert.ok(tooSmall.errors.some(error=>error.includes(failure)));
  const missing=planUiReviewScreenshots(reportFor(chartFiles('before').slice(1)),'before');
  assert.deepEqual(missing.errors,['Required screenshot was not captured: '+chartFiles('before')[0]]);
  const wireLimited=planUiReviewScreenshots(report,'after',{pngBytes:1_000_000,logBytes:100});
  assert.equal(wireLimited.selected.length,0);assert.ok(wireLimited.errors.length>0);
  assert.equal(report.cases[0].screenshots.length,14,'transport planning must not remove original captures');
});

test('encoded screenshot budgets include exact base64 chunk metadata and line overhead',()=>{
  for(const length of [1,3072,3073,8192]){
    const image=Buffer.alloc(length,31),file='wp4-after-1920x1080-chart.png',lines=[];
    const screenshot={file,bytes:image.length,sha256:createHash('sha256').update(image).digest('hex')};
    emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',image,{name:'ui-review-after/'+file,log:line=>lines.push(line)});
    assert.equal(screenshotLogBytes(screenshot,'after'),Buffer.byteLength(lines.join('\n')+'\n'));
  }
});

test('complete diagnostic verdict and failure report precede PNG transport',async()=>{
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-ui-report-order-'));
  try{
    const image=Buffer.alloc(9000,17),name='ui-review-after/ui-contract-btc-320-failure.png',lines=[];
    const transport=emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',image,{name,log:()=>{}});
    const receipt={status:'failed',phases:[{phase:'after',status:'failed',nativeReport:{status:'failed',failedCases:[{page:'ui-contract-btc',error:'actual failed assertion'}]}}]};
    await emitUiReviewArtifacts({receipt,directory,imageQueue:[{name,image,transport}],writeLog:line=>lines.push(line)});
    const verdict=lines.findIndex(line=>line.startsWith('ATLAS_UI_REVIEW_RECEIPT ')),firstImage=lines.findIndex(line=>line.startsWith('ETH_BROWSER_IMAGE_CHUNK '));
    assert.ok(verdict>=0&&firstImage>verdict);assert.equal(JSON.parse(lines[verdict].slice('ATLAS_UI_REVIEW_RECEIPT '.length)).status,'failed');
    const chunks=lines.filter(line=>line.startsWith('ETH_BROWSER_REPORT_CHUNK ')).map(line=>JSON.parse(line.slice('ETH_BROWSER_REPORT_CHUNK '.length)));
    const original=decodeCompressedBrowserReport(chunks,{name:'ui-review/diagnostic.json'});
    assert.deepEqual(original,await readFile(resolve(directory,'diagnostic.json')));
    assert.equal(JSON.parse(original).phases[0].nativeReport.failedCases[0].error,'actual failed assertion');
    assert.equal(JSON.parse(original).screenshotTransport.status,'prepared','a verdict before PNGs must not claim that image delivery has finished');
    assert.ok(lines.at(-1).startsWith('ATLAS_UI_REVIEW_IMAGES_COMPLETE '));
  }finally{await rm(directory,{recursive:true,force:true});}
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
