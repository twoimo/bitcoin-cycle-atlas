#!/usr/bin/env node
// Offline artifact verification only. ZIP digest/CRC and safe extraction are
// intentionally separate caller-owned evidence. No network or repository writes.
import {readFile,writeFile,readdir,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [artifactArgument,expectedCommit,treeArgument,outputArgument,repositoryArgument]=process.argv.slice(2);
const startedAt=new Date().toISOString(),SHA40=/^[a-f0-9]{40}$/,SHA64=/^[a-f0-9]{64}$/;
const sha=body=>createHash('sha256').update(body).digest('hex');
const gitBlob=body=>createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex');
const fail=message=>{throw new Error(message);};
const requireThat=(value,message)=>{if(!value)fail(message);};
let stage='arguments',json=JSON.stringify,output={schemaVersion:1,kind:'eth-continuity-artifact-verification',status:'running',startedAt};
function safePath(path){
  requireThat(typeof path==='string'&&path.length>0&&path.length<500&&!path.startsWith('/')&&!path.includes('\\')&&
    !/[\x00-\x1f\x7f]/.test(path)&&!path.split('/').some(part=>!part||part==='.'||part==='..'),'Unsafe verification path');
  return path;
}
function equalJson(actual,expected,label){requireThat(json(actual)===json(expected),label);}
function equalBytes(actual,expected,label){requireThat(Buffer.isBuffer(actual)&&Buffer.isBuffer(expected)&&actual.equals(expected),label);}
function unwrapTree(value){
  for(let depth=0;depth<8;depth++){
    if(typeof value==='string'){value=JSON.parse(value);continue;}
    if(value?.sha&&Array.isArray(value.tree))return value;
    if(value?.structuredContent?.content!==undefined){value=value.structuredContent.content;continue;}
    if(value?.tree&&typeof value.tree==='object'&&!Array.isArray(value.tree)){value=value.tree;continue;}
    if(value?.content!==undefined){value=value.content;continue;}
    break;
  }
  fail('Expected a complete GitHub recursive tree JSON object');
}
async function scan(root,{maximumFiles=20000,maximumBytes=3*1024*1024*1024}={}){
  const result=new Map();let total=0;
  async function visit(prefix=''){
    for(const entry of await readdir(resolve(root,prefix),{withFileTypes:true})){
      const path=prefix?prefix+'/'+entry.name:entry.name;safePath(path);
      const info=await lstat(resolve(root,path));
      requireThat(!info.isSymbolicLink(),'Symlink in extracted evidence '+path);
      if(info.isDirectory()){await visit(path);continue;}
      requireThat(info.isFile(),'Non-regular extracted evidence '+path);
      requireThat(result.size<maximumFiles&&(total+=info.size)<=maximumBytes,'Extracted evidence exceeds verification inventory bound');
      result.set(path,{bytes:info.size});
    }
  }
  await visit();return result;
}
async function main(){
  requireThat(process.argv.length>=5&&process.argv.length<=7&&SHA40.test(expectedCommit),
    'Usage: node verify-eth-continuity-artifact.mjs <artifact-root> <expected-source-commit> <remote-tree.json> [output.json] [repo-root]');
  const artifactRoot=await realpath(resolve(artifactArgument)),repositoryRoot=await realpath(resolve(repositoryArgument??process.cwd()));
  const treeBytes=await readFile(resolve(treeArgument));requireThat(treeBytes.length<=32*1024*1024,'Remote tree JSON is oversized');
  const treeEnvelope=JSON.parse(treeBytes.toString('utf8')),remoteTree=unwrapTree(treeEnvelope);
  requireThat(SHA40.test(remoteTree.sha)&&remoteTree.truncated===false,'Remote tree must be complete and content identified');
  if(treeEnvelope?.sourceCommit!==undefined)requireThat(treeEnvelope.sourceCommit===expectedCommit,'Caller tree source commit differs');
  const treeEntries=new Map();
  for(const entry of remoteTree.tree){safePath(entry.path);requireThat(!treeEntries.has(entry.path),'Duplicate remote source tree path');treeEntries.set(entry.path,entry);}
  const artifactInventory=await scan(artifactRoot);
  async function readArtifact(path,maximumBytes=128*1024*1024){
    safePath(path);const metadata=artifactInventory.get(path);requireThat(metadata&&metadata.bytes<=maximumBytes,'Missing or oversized artifact file '+path);
    const bytes=await readFile(resolve(artifactRoot,path));requireThat(bytes.length===metadata.bytes&&bytes.length<=maximumBytes,'Artifact file changed during verification '+path);return bytes;
  }
  async function artifactJson(path){const bytes=await readArtifact(path);const text=bytes.toString('utf8');requireThat(Buffer.from(text).equals(bytes),'Lossy UTF-8 artifact JSON '+path);return JSON.parse(text);}
  async function localCommitted(path){
    safePath(path);const entry=treeEntries.get(path),full=resolve(repositoryRoot,path),info=await lstat(full),actual=await realpath(full),location=relative(repositoryRoot,actual);
    requireThat(info.isFile()&&!info.isSymbolicLink()&&!location.startsWith('..')&&!isAbsolute(location),'Unsafe local verification helper '+path);
    requireThat(entry?.type==='blob'&&['100644','100755'].includes(entry.mode)&&info.size<=128*1024*1024,'Unbound or oversized local source '+path);
    const bytes=await readFile(actual);
    requireThat(gitBlob(bytes)===entry.sha&&(entry.size===undefined||entry.size===bytes.length),'Local source does not match supplied remote tree '+path);
    return bytes;
  }
  stage='source-book';
  await localCommitted('scripts/build-eth-review-packet.mjs');
  const {validateEthReviewSource}=await import(pathToFileURL(resolve(repositoryRoot,'scripts/build-eth-review-packet.mjs')).href);
  const manifest=await artifactJson('eth-review-packet/source-manifest.json'),book=await readArtifact('eth-review-packet/source-book.txt');
  requireThat(manifest.sourceCommit===expectedCommit&&manifest.sourceTree===remoteTree.sha,'Source-book source differs from requested source');
  requireThat(manifest.sourceAccess==='complete-for-declared-scope'&&Array.isArray(manifest.unresolvedImports)&&manifest.unresolvedImports.length===0,'Incomplete declared source scope');
  requireThat(Number.isSafeInteger(manifest.bundleLimitBytes)&&manifest.bundleLimitBytes>0&&manifest.bundleBytes<=manifest.bundleLimitBytes,'Invalid or exceeded source-book budget');
  const validated=validateEthReviewSource({manifest,sourceBook:book}),sources=validated.sources;
  const partsDigest=createHash('sha256'),partNames=new Set();let offset=0;
  for(const part of manifest.parts){
    const path='eth-review-packet/'+part.name,bytes=await readArtifact(path,1024*1024);
    requireThat(bytes.length===part.bytes&&sha(bytes)===part.sha256,'Source-book part byte identity mismatch '+part.name);
    equalBytes(bytes,book.subarray(offset,offset+bytes.length),'Source-book parts do not concatenate to exact book '+part.name);
    offset+=bytes.length;partsDigest.update(bytes);partNames.add(path);
  }
  requireThat(offset===book.length&&partsDigest.digest('hex')===manifest.bundleSha256,'Source-book reconstructed digest mismatch');
  const actualParts=[...artifactInventory.keys()].filter(path=>/^eth-review-packet\/source-part-\d+\.txt$/.test(path));
  requireThat(actualParts.length===partNames.size&&actualParts.every(path=>partNames.has(path)),'Unlisted or missing source-book parts');
  let committedFrames=0,executionFrames=0;
  for(const [path,{entry,body}]of sources){
    if(entry.kind==='committed-source'){
      const tree=treeEntries.get(path);
      requireThat(tree?.type==='blob'&&['100644','100755'].includes(tree.mode)&&tree.sha===entry.gitBlob&&gitBlob(body)===tree.sha&&
        (tree.size===undefined||tree.size===body.length),'Committed source frame does not match remote Git tree '+path);
      committedFrames++;
    }else{
      requireThat(path.startsWith('build/'),'Unexpected execution evidence root '+path);
      equalBytes(await readArtifact(path.slice(6)),body,'Framed execution evidence differs from extracted artifact '+path);executionFrames++;
    }
  }
  output.source={expectedCommit,sourceCommit:manifest.sourceCommit,sourceTree:manifest.sourceTree,
    suppliedRemoteTreeJsonSha256:sha(treeBytes),callerDeclaredCommit:treeEnvelope?.sourceCommit??null,
    commitToTreeLookupAuthenticatedByThisOfflineVerifier:false,
    commitToTreeBoundary:'Caller supplies the remote tree obtained for expectedCommit; offline verification binds all payload blobs to that supplied tree.',
    bundleBytes:book.length,bundleSha256:sha(book),bundleLimitBytes:manifest.bundleLimitBytes,
    parts:manifest.parts.length,partsConcatenateExactly:true,frames:sources.size,committedFrames,executionFrames,
    sourceAccess:manifest.sourceAccess,unresolvedImports:manifest.unresolvedImports.length,
    allFramedPayloadsVerified:true,allCommittedGitBlobsMatchSuppliedTree:true,allExecutionFramesMatchExtractedArtifact:true,
    sourceBookExternalReviewStatus:manifest.externalReview?.status??null,
    externalReviewPacketDoesNotOverrideUserOmission:true};
  const helperRoots=['scripts/build-eth-review-packet.mjs','scripts/ethereum-prospective-archive-core.mjs','scripts/ethereum-prospective-archive-remote.mjs',
    'scripts/ethereum-prospective-calibration-core.mjs','scripts/btc-offline-refresh-policy.mjs','dist/ethereum-prospective-dispatch.js'];
  const helperSources=new Map();
  async function bindHelper(path){
    if(helperSources.has(path))return;
    const body=await localCommitted(path),framed=sources.get(path);
    requireThat(framed?.entry.kind==='committed-source','Verification helper absent from source-book '+path);
    equalBytes(body,framed.body,'Local helper differs from framed source '+path);helperSources.set(path,{bytes:body.length,sha256:sha(body),gitBlobSha:gitBlob(body)});
    for(const match of body.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=posix.normalize(posix.join(posix.dirname(path),match[1].split(/[?#]/)[0]));safePath(dependency);await bindHelper(dependency);
    }
  }
  for(const path of helperRoots)await bindHelper(path);
  output.localVerificationSource={repositoryRoot,files:Object.fromEntries([...helperSources].sort(([a],[b])=>a.localeCompare(b))),
    allHelpersMatchRemoteCommittedFrames:true,gitHeadUsedAsRemoteIdentity:false};
  const {canonicalForecastJson}=await import(pathToFileURL(resolve(repositoryRoot,'dist/forecast-records.js')).href);json=canonicalForecastJson;
  const {isExpectedOfflineBtcRefresh}=await import(pathToFileURL(resolve(repositoryRoot,'scripts/btc-offline-refresh-policy.mjs')).href);
  const {verifyEthereumProspectiveArchive,restoreEthereumProspectiveArchive}=await import(pathToFileURL(resolve(repositoryRoot,'scripts/ethereum-prospective-archive-core.mjs')).href);
  const {validateEthereumArchiveRemoteReadReceipt}=await import(pathToFileURL(resolve(repositoryRoot,'scripts/ethereum-prospective-archive-remote.mjs')).href);
  const {validateAssetOutcomeIndex,verifyAssetOutcomeSnapshot,assetOutcomeSnapshotEntry}=await import(pathToFileURL(resolve(repositoryRoot,'dist/asset-outcome-records.js')).href);
  const {replayEthereumProspectiveRecord}=await import(pathToFileURL(resolve(repositoryRoot,'dist/ethereum-prospective-dispatch.js')).href);
  const {createEthereumProspectiveCalibrationSession,buildEthereumProspectiveCalibrationReadinessBatch}=await import(pathToFileURL(resolve(repositoryRoot,'scripts/ethereum-prospective-calibration-core.mjs')).href);
  function bodyJson(path){const source=sources.get(path);requireThat(source,'Missing framed evidence '+path);return JSON.parse(source.body.toString('utf8'));}
  function contentIdentity(value,label){const {id,...body}=value;requireThat(SHA64.test(id)&&sha(Buffer.from(json(body)))===id,label+' content ID differs');}
  const additionalCommittedInputs=new Map();
  const framedBodiesByGitBlob=new Map();
  for(const [path,{entry,body}]of sources){
    const digest=entry.kind==='committed-source'?entry.gitBlob:gitBlob(body);
    if(!framedBodiesByGitBlob.has(digest))framedBodiesByGitBlob.set(digest,{path,body});
  }
  async function inputBytes(path){
    const framed=sources.get(path);if(framed)return framed.body;
    if(path.startsWith('build/'))return readArtifact(path.slice(6));
    // A partial local checkout can omit a committed data copy whose exact
    // bytes are already preserved under another framed path. Its target Git
    // identity still comes from the supplied remote source tree, not the alias.
    const tree=treeEntries.get(path),retained=framedBodiesByGitBlob.get(tree?.sha);
    if(retained&&tree?.type==='blob'&&['100644','100755'].includes(tree.mode)){
      requireThat((tree.size===undefined||tree.size===retained.body.length)&&gitBlob(retained.body)===tree.sha,
        'Retained frame does not match additional committed source '+path);
      additionalCommittedInputs.set(path,{bytes:retained.body.length,sha256:sha(retained.body),gitBlobSha:tree.sha,resolvedFromExactFramedBody:retained.path});
      return retained.body;
    }
    const bytes=await localCommitted(path);additionalCommittedInputs.set(path,{bytes:bytes.length,sha256:sha(bytes),gitBlobSha:gitBlob(bytes)});return bytes;
  }
  async function validateHashInventory(inventory,label){
    requireThat(inventory&&typeof inventory==='object'&&!Array.isArray(inventory),label+' inventory is missing');
    for(const [path,entry]of Object.entries(inventory)){
      const bytes=await inputBytes(path),digest=typeof entry==='string'?entry:entry.sha256;
      requireThat(sha(bytes)===digest&&(typeof entry==='string'||entry.bytes===bytes.length),label+' byte hash differs '+path);
    }
  }

  stage='browser-screenshots-and-offline-failures';
  const browser=await artifactJson('eth-browser/report.json');
  requireThat(browser.sourceCommit===expectedCommit&&browser.status==='passed'&&Array.isArray(browser.cases)&&browser.cases.length>0&&
    Array.isArray(browser.failures)&&browser.failures.length===0,'Browser report did not pass for requested source');
  await validateHashInventory(browser.sourceHashes,'Browser source');
  const btcBytes=sources.get('dist/data/btc-daily.json')?.body??await localCommitted('dist/data/btc-daily.json'),btc=JSON.parse(btcBytes.toString('utf8')),lastBtc=btc.prices.at(-1);
  const expectedBtc={sourceUrl:btc.meta.source,asOf:lastBtc[0],price:lastBtc[1],formattedPrice:'$'+new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(lastBtc[1]),archiveSha256:sha(btcBytes)};
  equalJson(browser.expectedObservedBtc,expectedBtc,'Browser expected BTC archive differs from committed source');
  const screenshotEntries=new Map(),offlineWitnesses=[];let rawErrors=0,runtimeErrors=0,unexpectedErrors=0,optionalFontBlocks=0;
  function checkedNotice(witness,label){
    const observed=witness.observed,notice=observed?.notice,date=expectedBtc.asOf.replaceAll('-','.');
    requireThat(observed?.title==='갱신에 실패했습니다. 검증된 이전 데이터를 표시합니다.'&&observed.disabled===false&&observed.busy===false&&
      observed.cutoff==='관측 · '+date+' UTC',label+' failed refresh or retained cutoff witness mismatch');
    requireThat(notice?.visible===true&&notice.state==='failed'&&notice.summary==='비트코인 일별 갱신 실패'&&notice.detail===date+' UTC 자료 유지'&&
      notice.retryDisabled===false&&notice.retryTopmost===true&&notice.summaryTopmost===true&&notice.summaryUnclipped===true&&notice.detailUnclipped===true,
      label+' visible failed refresh notice mismatch');
    requireThat(notice.liveRole==='status'&&notice.livePoliteness==='polite'&&notice.liveAtomic==='true'&&notice.duplicateAnnouncements===1,
      label+' failed refresh announcement witness mismatch');
    for(const box of [notice.box,notice.retryBox])requireThat(box&&[box.left,box.right,box.top,box.bottom,notice.viewportWidth,notice.viewportHeight].every(Number.isFinite)&&
      box.left>=-1&&box.right<=notice.viewportWidth+1&&box.top>=-1&&box.bottom<=notice.viewportHeight+1,label+' failed refresh notice escaped viewport');
    if(notice.viewportWidth<=620)requireThat(notice.retryBox.width>=44&&notice.retryBox.height>=44,label+' touch retry is undersized');
    const numericQuoteDisplayed=observed.page==='outlook';
    requireThat(witness.displayedPriceVerified===numericQuoteDisplayed,label+' numeric-price witness has wrong scope');
    if(numericQuoteDisplayed)requireThat(observed.price===expectedBtc.formattedPrice&&observed.priceDate===date+' UTC'&&observed.priceKind==='observed',label+' retained BTC numeric quote mismatch');
    requireThat(witness.failureTitleVerified===true&&witness.persistentVisibleErrorVerified===true&&
      witness.archiveAsOf===expectedBtc.asOf&&witness.archiveSha256===expectedBtc.archiveSha256,label+' archive preservation witness mismatch');
  }
  for(const [caseIndex,c]of browser.cases.entries()){
    const label=c.page+' '+c.width+'x'+c.height;
    requireThat(c.status==='passed'&&Array.isArray(c.runtimeErrors)&&Array.isArray(c.resourceErrors)&&
      Array.isArray(c.expectedOfflineRefresh)&&Array.isArray(c.unexpectedResourceErrors),label+' incomplete browser case');
    runtimeErrors+=c.runtimeErrors.length;rawErrors+=c.resourceErrors.length;unexpectedErrors+=c.unexpectedResourceErrors.length;optionalFontBlocks+=(c.blockedOptionalFonts??[]).length;
    requireThat(c.runtimeErrors.length===0&&c.unexpectedResourceErrors.length===0,label+' unexpected runtime or resource errors');
    const matchedRequestIds=new Set();
    for(const witness of c.expectedOfflineRefresh){
      checkedNotice(witness,label);requireThat(Array.isArray(witness.requestIds)&&witness.requestIds.length===1,label+' refresh must identify exactly one request');
      const id=witness.requestIds[0],matches=c.resourceErrors.filter(error=>error.requestId===id);
      requireThat(!matchedRequestIds.has(id)&&matches.length===1,label+' duplicate or missing offline request witness');
      const error=matches[0];
      requireThat(error.frameId===witness.frameId&&error.loaderId===witness.loaderId&&
        isExpectedOfflineBtcRefresh(error,{surface:c.surface,archiveAsOf:expectedBtc.asOf}),label+' raw error does not satisfy existing narrow offline policy');
      matchedRequestIds.add(id);offlineWitnesses.push({caseIndex,page:c.page,surface:c.surface,width:c.width,height:c.height,phase:witness.phase,
        requestId:id,frameId:witness.frameId,loaderId:witness.loaderId,numericQuoteVerified:witness.displayedPriceVerified,
        archiveAsOf:witness.archiveAsOf,archiveSha256:witness.archiveSha256});
    }
    const unmatched=c.resourceErrors.filter(error=>!matchedRequestIds.has(error.requestId));
    requireThat(unmatched.length===0,label+' has raw resource errors without policy and UI witnesses');
    requireThat(Array.isArray(c.screenshots),label+' screenshot inventory missing');
    for(const screenshot of c.screenshots){
      safePath(screenshot.file);requireThat(!screenshot.file.includes('/')&&screenshot.file.endsWith('.png')&&!screenshotEntries.has(screenshot.file),'Unsafe or duplicate screenshot path');
      const bytes=await readArtifact('eth-browser/'+screenshot.file,32*1024*1024);
      requireThat(bytes.length===screenshot.bytes&&sha(bytes)===screenshot.sha256&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
        'Screenshot identity or PNG signature mismatch '+screenshot.file);
      screenshotEntries.set(screenshot.file,{...screenshot,page:c.page,width:c.width,height:c.height});
    }
  }
  const actualPngs=[...artifactInventory.keys()].filter(path=>path.toLowerCase().endsWith('.png'));
  requireThat(actualPngs.length===screenshotEntries.size&&actualPngs.every(path=>path.startsWith('eth-browser/')&&screenshotEntries.has(path.slice(12))),
    'PNG accounting differs from browser screenshot receipts');
  if(browser.syntheticFixture){
    const f=browser.syntheticFixture,bytes=await readArtifact('eth-browser/'+safePath(f.file));
    requireThat(bytes.length===f.bytes&&sha(bytes)===f.sha256,'Browser-only synthetic fixture bytes differ');
  }
  output.browser={sourceCommit:browser.sourceCommit,status:browser.status,cases:browser.cases.length,passedCases:browser.cases.filter(c=>c.status==='passed').length,
    screenshots:screenshotEntries.size,allActualPngFilesAccounted:true,allScreenshotBytesAndHashesMatched:true,runtimeErrors,
    rawResourceErrors:rawErrors,expectedOfflineBtcRefreshErrors:offlineWitnesses.length,unexpectedResourceErrors:unexpectedErrors,
    optionalFontBlocks,expectedBtc,offlineWitnesses,screenshotInventory:[...screenshotEntries.values()],
    countsAreObservedNotFixedExpectations:true,policy:'isExpectedOfflineBtcRefresh plus the existing failed UI and retained archive witnesses; numeric quote checked only for outlook'};

  stage='archive-restore-and-original-records';
  const seedPrefix='research-data/ethereum-prospective-archive/';
  const seedFiles=new Map([...sources].filter(([path,{entry}])=>path.startsWith(seedPrefix)&&entry.kind==='committed-source').map(([path,{body}])=>[path.slice(seedPrefix.length),Buffer.from(body)]));
  const committedSeedPaths=[...treeEntries].filter(([path,entry])=>path.startsWith(seedPrefix)&&entry.type==='blob').map(([path])=>path.slice(seedPrefix.length));
  requireThat(seedFiles.size>0&&seedFiles.size===committedSeedPaths.length&&committedSeedPaths.every(path=>seedFiles.has(path)),
    'Source book omits a file from the complete committed bootstrap tree');
  const seed=await verifyEthereumProspectiveArchive({files:seedFiles});
  const completeSeedAnchor='c65342e22b783fc387b6965afe5ce5d946713a883fe7838883daa2ce64744d51';
  requireThat(seedFiles.has('manifests/'+completeSeedAnchor+'.json')&&seedFiles.has('manifests/482cbcd7df1a7a6382124273a5a5d143c08a9b3006944ead514f6a5d6ce76961.json'),
    'Complete legacy-input bootstrap or its retained generation 2 ancestor is missing');
  const archivePrefix='ethereum-prospective-archive/',archiveFiles=new Map();
  for(const path of artifactInventory.keys())if(path.startsWith(archivePrefix))archiveFiles.set(path.slice(archivePrefix.length),await readArtifact(path,8*1024*1024));
  const verifiedArchive=await verifyEthereumProspectiveArchive({files:archiveFiles}),restored=await restoreEthereumProspectiveArchive({files:archiveFiles});
  // Reconstruct the exact previous generation from the retained immutable
  // chain. Its alias is the earlier manifest's original bytes, and only that
  // generation's reachable pages/objects/manifests enter its transport Map.
  // A current union cannot stand in for independently verifying its parent.
  const predecessorId=verifiedArchive.manifest.previousManifestId;
  requireThat(SHA64.test(predecessorId),'Current run archive has no immutable predecessor');
  const predecessorFiles=new Map();
  function retainPrevious(path){
    const bytes=archiveFiles.get(path);requireThat(Buffer.isBuffer(bytes),'Missing retained predecessor bytes '+path);
    predecessorFiles.set(path,Buffer.from(bytes));return bytes;
  }
  const predecessorManifestBytes=retainPrevious('manifests/'+predecessorId+'.json'),predecessorManifest=JSON.parse(predecessorManifestBytes.toString('utf8'));
  predecessorFiles.set('manifest.json',Buffer.from(predecessorManifestBytes));
  let ancestorId=predecessorId;const ancestorIds=new Set();
  while(ancestorId!==null){
    requireThat(SHA64.test(ancestorId)&&!ancestorIds.has(ancestorId)&&ancestorIds.size<4096,'Invalid predecessor manifest chain');ancestorIds.add(ancestorId);
    const ancestor=JSON.parse(retainPrevious('manifests/'+ancestorId+'.json').toString('utf8'));ancestorId=ancestor.previousManifestId;
  }
  for(const descriptor of predecessorManifest.pages){
    const page=JSON.parse(retainPrevious(descriptor.path).toString('utf8'));
    for(const entry of page.entries)retainPrevious(entry.objectPath);
  }
  const predecessor=await verifyEthereumProspectiveArchive({files:predecessorFiles});
  requireThat(predecessor.manifest.id===predecessorId&&verifiedArchive.manifest.sequence===predecessor.manifest.sequence+1,
    'Current PR archive is not exactly one append from its independently verified predecessor');
  requireThat(verifiedArchive.manifest.source.sourceCommit===expectedCommit&&verifiedArchive.manifest.source.sourceTree===remoteTree.sha,'Archive generation source differs from requested source');
  for(const [path,bytes]of seedFiles)if(path!=='manifest.json'){
    equalBytes(predecessorFiles.get(path),bytes,'Predecessor omitted or changed an original committed seed immutable file '+path);
    equalBytes(archiveFiles.get(path),bytes,'Original seed immutable file changed '+path);
  }
  const remoteReadReceipt=await artifactJson('ethereum-prospective-archive-remote-receipt.json');
  requireThat(['restored','absent'].includes(remoteReadReceipt.status),'Unexpected remote reader status');
  const remoteRead=validateEthereumArchiveRemoteReadReceipt({receipt:remoteReadReceipt,files:remoteReadReceipt.status==='restored'?predecessorFiles:new Map()});
  requireThat(remoteReadReceipt.automaticSeedFallback===false&&remoteReadReceipt.providerAuthenticity===false&&
    remoteReadReceipt.productionPromoted===false&&remoteReadReceipt.releaseAuthorized===false,'Remote reader exceeded its declared integrity-only boundary');
  if(remoteRead.status==='restored')requireThat(remoteRead.manifestId===predecessorId&&remoteReadReceipt.allGitBlobsVerified===true&&remoteReadReceipt.allArchiveBytesVerified===true,
    'Remote reader did not bind the exact reconstructed predecessor');
  else{
    requireThat(predecessorId===seed.manifest.id&&predecessorFiles.size===seedFiles.size,'Absent remote requires exactly the committed seed predecessor');
    for(const [path,bytes]of seedFiles)equalBytes(predecessorFiles.get(path),bytes,'Absent-branch predecessor differs from committed seed '+path);
  }
  for(const [path,bytes]of restored.files)equalBytes(await readArtifact('ethereum-prospective-ledger/'+path),bytes,'Restored archive differs from actual ledger '+path);
  // The restored working directory is the predecessor snapshot. A separate
  // asset-outcome job may add current observations before this append; verify
  // those through every exact indexed source, not an assumed post-append rewrite.
  const restoredPredecessor=await restoreEthereumProspectiveArchive({files:predecessorFiles});
  for(const [path,bytes]of restoredPredecessor.outcomeFiles)equalBytes(await readArtifact('ethereum-prospective-archive-outcomes/'+path),bytes,'Initially restored independent outcomes differ '+path);
  const outcomeSources=[],independentEth=new Map();
  for(const prefix of ['research-data/asset-outcome-ledger/','build/asset-outcome-ledger/','build/ethereum-prospective-archive-outcomes/']){
    const indexPath=prefix+'index.json',indexBytes=await inputBytes(indexPath);
    requireThat(indexBytes.length<=1024*1024,'Outcome index exceeds unchanged byte limit '+indexPath);
    const index=validateAssetOutcomeIndex(JSON.parse(indexBytes.toString('utf8'))),validated=[];
    for(const entry of index.observations){
      const path=prefix+entry.path,raw=await inputBytes(path);requireThat(raw.length<=8*1024*1024,'Indexed outcome exceeds byte limit '+path);
      const value=JSON.parse(raw.toString('utf8'));await verifyAssetOutcomeSnapshot(value);
      equalBytes(raw,Buffer.from(json(value)+'\n'),'Indexed outcome is not exact canonical UTF-8 '+path);
      equalJson(assetOutcomeSnapshotEntry(value),entry,'Indexed outcome metadata does not match its verified raw observation '+path);
      validated.push({id:value.id,symbol:value.symbol,path,bytes:raw.length,sha256:sha(raw)});
      if(value.symbol==='ETHUSD'){
        const prior=independentEth.get(value.id);if(prior)equalBytes(prior,raw,'Conflicting independent ETH raw identity');
        independentEth.set(value.id,raw);
      }
    }
    outcomeSources.push({indexPath,indexBytes:indexBytes.length,indexSha256:sha(indexBytes),validatedBeforeSymbolFilter:validated});
  }
  const archivedIndependent=[...verifiedArchive.logicalFiles].filter(([path])=>path.startsWith('outcome-observations/'));
  requireThat(archivedIndependent.length===independentEth.size,'Current archive does not retain the complete indexed independent ETH union');
  for(const [path,raw]of archivedIndependent)equalBytes(independentEth.get(path.split('/')[1].slice(0,-5)),raw,'Archived independent ETH differs from exact indexed sources');
  const originalRecords=[
    {id:'563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b',modelKey:'adaptive',issuedAt:'2026-10-27T07:44:13.396Z',graphFiles:14,sourceHash:'cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491'},
    {id:'f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1',modelKey:'pooled',issuedAt:'2026-10-27T07:44:13.396Z',graphFiles:14,sourceHash:'cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491'},
    {id:'d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72',modelKey:'warmStart',issuedAt:'2026-10-27T09:57:51.931Z',graphFiles:17,sourceHash:'463085b24aa701b66a6e754c6b6437a157f2bc1cbc7fd1b2403a072b4b9d42ca'},
  ];
  const records=verifiedArchive.semantics.records,snapshots={},observations=[],replays=[];
  for(const [path,bytes]of verifiedArchive.logicalFiles){
    if(path.startsWith('snapshots/')){const value=JSON.parse(bytes);snapshots[value.id]=value;}
    if(/^(observations|outcome-observations)\//.test(path))observations.push(JSON.parse(bytes));
  }
  observations.sort((a,b)=>a.id.localeCompare(b.id));
  for(const expected of originalRecords){
    const record=records.find(record=>record.id===expected.id);requireThat(record,'Original issued record missing '+expected.id);
    requireThat(record.modelKey===expected.modelKey&&record.issuedAt===expected.issuedAt&&record.output.path.length===731&&
      Object.keys(record.model.files).length===expected.graphFiles&&record.model.sourceHash===expected.sourceHash,'Original issued record identity/clock/path/graph changed '+expected.id);
    equalBytes(verifiedArchive.logicalFiles.get('records/'+expected.id+'.json'),seed.logicalFiles.get('records/'+expected.id+'.json'),'Original issued record bytes changed '+expected.id);
  }
  for(const record of records){
    for(const [path,hash]of Object.entries(record.model.files)){
      const framed=sources.get(path);requireThat(framed?.entry.kind==='committed-source'&&framed.entry.sha256===hash,'Recorded model graph differs from new committed source '+path);
      equalBytes(await localCommitted(path),framed.body,'Local model graph differs from committed frame '+path);
    }
    replays.push(await replayEthereumProspectiveRecord({record,snapshot:snapshots[record.snapshotId],currentModel:{...record.model,sourceCommit:expectedCommit}}));
  }
  const restoreReceipt=await artifactJson('ethereum-prospective-archive-restore.json'),appendReceipt=await artifactJson('ethereum-prospective-archive-append.json'),verifyReceipt=await artifactJson('ethereum-prospective-archive-verify.json');
  requireThat(restoreReceipt.status==='restored'&&restoreReceipt.manifestId===predecessorId&&restoreReceipt.sequence===predecessor.manifest.sequence&&
    restoreReceipt.seedManifestId===seed.manifest.id&&restoreReceipt.expectedRemoteHead===remoteRead.expectedHead&&
    restoreReceipt.basis===(remoteRead.status==='restored'?'verified-remote-branch':'explicitly-absent-remote-with-committed-seed'),
    'Actual restore receipt differs from its independently verified predecessor and remote read');
  requireThat(appendReceipt.status==='appended-and-restored'&&appendReceipt.manifestId===verifiedArchive.manifest.id&&
    appendReceipt.previousManifestId===predecessorId&&appendReceipt.sequence===verifiedArchive.manifest.sequence&&
    appendReceipt.exactPreviousFilesRetained===true&&appendReceipt.roundTripOriginalBytesMatched===true,'Actual append receipt differs from reconstructed archive');
  requireThat(verifyReceipt.status==='verified'&&verifyReceipt.manifestId===verifiedArchive.manifest.id,'Actual verify receipt differs from reconstructed archive');
  for(const receipt of [appendReceipt,verifyReceipt])requireThat(receipt.source?.sourceCommit===expectedCommit&&receipt.source?.sourceTree===remoteTree.sha&&
    receipt.releaseAuthorized===false&&receipt.productionPromoted===false,'Archive command source or authorization mismatch');
  const predecessorRecordIds=new Set(predecessor.semantics.records.map(record=>record.id));
  const predecessorObservationIds=new Set([...predecessor.logicalFiles.keys()].filter(path=>/^(observations|outcome-observations)\//.test(path)).map(path=>path.split('/')[1].slice(0,-5)));
  const newRecordIds=records.filter(record=>!predecessorRecordIds.has(record.id)).map(record=>record.id).sort();
  const newObservationIds=observations.filter(observation=>!predecessorObservationIds.has(observation.id)).map(observation=>observation.id).sort();
  equalJson([...appendReceipt.newRecordIds].sort(),newRecordIds,'Append receipt new records differ from actual immutable inventory');
  equalJson([...appendReceipt.newObservationIds].sort(),newObservationIds,'Append receipt new observations differ from actual immutable inventory');
  output.archive={seed:seed.receipt,predecessor:predecessor.receipt,actual:verifiedArchive.receipt,restored:restored.receipt,
    completeSeedAnchor,completeCommittedSeedTreeFramed:true,
    predecessorTransportFiles:predecessorFiles.size,exactPredecessorReconstructedAndIndependentlyVerified:true,
    newCountsComparedToActualPredecessor:true,remoteRead:{...remoteRead,transport:remoteReadReceipt.transport},
    independentOutcomeSources:outcomeSources,allIndexedOutcomesValidatedBeforeSymbolFiltering:true,
    seedTransportFiles:seedFiles.size,unchangedSeedImmutableFiles:seedFiles.size-1,allSeedFilesPreservedExceptMutableAlias:true,
    actualArchiveTransportFiles:archiveFiles.size,actualArchiveBytes:[...archiveFiles.values()].reduce((sum,value)=>sum+value.length,0),
    newRecordIds,newObservationIds,originalRecords:originalRecords.map(value=>({...value,points:731,originalBytesEqual:true})),
    actualLocalModelReplays:replays,actualRestoreReceiptStatus:restoreReceipt.status,actualAppendReceiptStatus:appendReceipt.status,
    actualVerifyReceiptStatus:verifyReceipt.status,remoteDataBranchPublishedByThisVerifier:false};

  stage='readiness-capacity-and-release';
  const readinessEnvelope=await artifactJson('ethereum-prospective-calibration-readiness.json'),readiness=readinessEnvelope.report;
  requireThat(readinessEnvelope.provenance?.sourceCommit===expectedCommit&&readinessEnvelope.provenance?.sourceTree===remoteTree.sha,'Readiness execution source differs');
  contentIdentity(readiness,'Readiness report');await validateHashInventory(readiness.inputFiles,'Readiness input');
  await validateHashInventory(readinessEnvelope.provenance.sourceFiles,'Readiness source');
  equalJson(readiness.preservedRecordIds,records.map(record=>record.id),'Readiness record inventory differs from complete archive');
  equalJson(readiness.preservedObservationIds,observations.map(value=>value.id),'Readiness observation inventory differs from complete archive');
  equalJson(readiness.actualSourceReplay,replays,'Readiness recorded replay differs from local numeric reexecution');
  const bindings=new Map();for(const record of records)for(const horizonDays of [30,90,180]){
    const binding={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,options:record.options,horizonDays};bindings.set(json(binding),binding);
  }
  const orderedBindings=[...bindings.values()].sort((a,b)=>json(a).localeCompare(json(b)));
  equalJson(readiness.results.map(row=>row.binding),orderedBindings,'Readiness bindings omit or alter an actual experiment');
  const session=await createEthereumProspectiveCalibrationSession({records,snapshots,observations});
  const rebuiltReadiness=await buildEthereumProspectiveCalibrationReadinessBatch({session,bindings:orderedBindings,informationCutoffAt:readiness.informationCutoffAt});
  equalJson(rebuiltReadiness,readiness.results,'Readiness results do not reproduce from every actual archived input');
  requireThat(readiness.actualFreezesCreated===0&&readiness.actualCalibratedRecordsIssued===0&&readiness.prospectiveCalibratedTargetsScored===0&&
    readiness.existingRecordsChanged===false&&readiness.productionPromoted===false,'Readiness command exceeded its reporting-only boundary');
  requireThat(readiness.readyBindings===readiness.results.filter(row=>row.status==='ready-to-freeze').length,'Readiness ready count differs');
  const capacity=await artifactJson('ethereum-prospective-capacity.json');contentIdentity(capacity,'Capacity report');
  await validateHashInventory(capacity.inputFiles,'Capacity input');await validateHashInventory(capacity.sourceFiles,'Capacity source');
  equalJson(capacity.diagnostic.inventory.recordIds,records.map(record=>record.id),'Capacity record inventory differs');
  equalJson(capacity.diagnostic.inventory.observationIds,observations.map(value=>value.id),'Capacity observation inventory differs');
  requireThat(capacity.actualNewRecords===0&&capacity.actualNewObservations===0&&capacity.releaseAuthorized===false&&capacity.diagnostic.limitsChanged===false,
    'Capacity projection created evidence or relaxed limits');
  const issuance=await artifactJson('ethereum-prospective-ledger/receipt.json'),replayReceipt=await artifactJson('ethereum-prospective-ledger/replay-receipt.json');
  for(const receipt of [issuance,replayReceipt])requireThat(receipt.sourceCommit===expectedCommit&&receipt.sourceTree===remoteTree.sha&&
    receipt.releaseAuthorized===false&&receipt.externalGeminiReview==='omitted-by-user'&&receipt.reverseReview==='omitted-by-user','Issuer source or user review policy mismatch');
  requireThat(replayReceipt.status==='verified-preserved','Preserved replay-only command failed');
  const modelReadiness=await artifactJson('ethereum-model-readiness.json');
  requireThat(modelReadiness.sourceCommit===expectedCommit&&modelReadiness.sourceTree===remoteTree.sha&&modelReadiness.release?.draft===true&&
    modelReadiness.release.authorized===false&&modelReadiness.release.productionPromoted===false&&
    modelReadiness.release.geminiOpposition==='omitted-by-user'&&modelReadiness.release.followupReverseReview==='omitted-by-user','Model readiness release boundary differs');
  output.prospective={issuedStatus:issuance.status,issuerNewRecords:issuance.newRecords,issuerReusedRecords:issuance.reusedRecords,
    issuerTotalRecords:issuance.totalRecords,issuerErrors:issuance.errors??[],preservedReplayStatus:replayReceipt.status,
    archivedNewRecords:newRecordIds.length,archivedNewObservations:newObservationIds.length,
    readinessId:readiness.id,informationCutoffAt:readiness.informationCutoffAt,records:records.length,observations:observations.length,
    readinessResultsRecomputedFromCompleteArchive:true,bindings:readiness.results.length,readyBindings:readiness.readyBindings,
    actualFreezesCreated:readiness.actualFreezesCreated,actualCalibratedRecordsIssued:readiness.actualCalibratedRecordsIssued,
    prospectiveCalibratedTargetsScored:readiness.prospectiveCalibratedTargetsScored,
    results:readiness.results.map(row=>({id:row.id,modelKey:row.binding.modelKey,horizonDays:row.binding.horizonDays,status:row.status,
      selectedCalibrationCases:row.selectedCalibrationCases,validSelectedOutcomes:row.validSelectedOutcomes,requiredCalibrationCases:row.requiredCalibrationCases,
      missingSelectedOutcomes:row.missingSelectedOutcomes,invalidSelectedForecasts:row.invalidSelectedForecasts,invalidObservations:row.invalidObservations.length,
      pendingRecords:row.pendingRecords.length,logRadius:row.logRadius})),
    capacityId:capacity.id,capacityCutoffAt:capacity.informationCutoffAt,capacityInventory:capacity.diagnostic.inventory,
    capacityReportAndInputIdentitiesVerified:true,capacityArithmeticRecomputedByThisVerifier:false,
    capacityDailyContinuation:capacity.diagnostic.dailyContinuation,unchangedCurrentBase:capacity.diagnostic.unchangedCurrentBase,
    workflowInspection:capacity.diagnostic.workflowInspection,remainingOperationalRequirements:capacity.diagnostic.remainingOperationalRequirements,
    calendarSummaries:capacity.diagnostic.calendars.map(row=>({modelKey:row.binding.modelKey,horizonDays:row.binding.horizonDays,
      earliestCalendarObservationEndAt:row.earliestCalendarObservationEndAt,actualMaturedWindowsInFirstTwelve:row.actualMaturedWindowsInFirstTwelve,
      hypotheticalFutureWindows:row.hypotheticalFutureWindows,projectedRecords:row.projectedRecords,projectedCompactIndexBytes:row.projectedCompactIndexBytes,
      observationsAtCalendarEnd:row.observationsAtCalendarEnd,conditionalOperationalBlockers:row.conditionalOperationalBlockers}))};
  output.economics={requiredMetricCount:modelReadiness.economics.requiredMetricCount,providedSnapshots:modelReadiness.economics.providedSnapshots,
    eligibleFullSnapshots:modelReadiness.economics.eligibleFullSnapshots,inputInspection:modelReadiness.economics.inputInspection,
    metricEvidenceSummary:modelReadiness.economics.metricEvidence?.summary??null,
    metricGaps:(modelReadiness.economics.metricEvidence?.metrics??[]).map(row=>({metric:row.metric,status:row.status,gapCodes:row.gaps?.gapCodes??[]}))};
  output.additionalCommittedInputBytesUsed=Object.fromEntries(additionalCommittedInputs);
  output.release=modelReadiness.release;
  output.zipVerification={performedByThisScript:false,scope:'ZIP digest, CRC, extraction path safety and download identity are separate caller-provided evidence.'};
  output.extractedInventory={files:artifactInventory.size,bytes:[...artifactInventory.values()].reduce((sum,value)=>sum+value.bytes,0),regularFilesOnly:true};
  output.limitations={providerAuthenticity:false,historicalPublicationAuthenticated:false,prospectivePerformanceProven:false,
    remoteWriterExecutedByThisVerifier:false,scheduleActivationProven:false,gitWireBytes:null,gitHttpRequestCount:null,
    reviewOmission:'Gemini opposition and follow-up reverse review remain omitted-by-user.'};
  output.status='verified';output.finishedAt=new Date().toISOString();output.durationMs=Date.parse(output.finishedAt)-Date.parse(startedAt);
}
try{await main();}
catch(error){output={...output,status:'failed',failedStage:stage,finishedAt:new Date().toISOString(),error:{name:error.name,message:String(error.message).slice(0,3000)}};process.exitCode=1;}
if(outputArgument)await writeFile(resolve(outputArgument),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify(output,null,2)+'\n');
