// Pure replay of already captured bytes. No network call or economic activation.
import {readFile,readdir,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {analyzeEthereumSupplyResolution,supplyResolutionTimestamp,ETH_SUPPLY_RESOLUTION_POLICY} from './ethereum-supply-resolution-core.mjs';
import {ETH_SUPPLY_ACCOUNTING_SOURCE as SOURCE} from './ethereum-supply-accounting-core.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
export const ETH_SUPPLY_RESOLUTION_ROOTS=Object.freeze([
  'build/ethereum-supply-accounting',
  'docs/eth-candidate-evidence/20261027-vintages-calibration/final-run/ethereum-supply-accounting',
]);
const safePath=path=>typeof path==='string'&&path.length>0&&!isAbsolute(path)&&!/[\\\u0000-\u001f\u007f]/.test(path)&&!path.split('/').some(part=>['.','..',''].includes(part));
const expect=(ok,message)=>{if(!ok)throw new RangeError(message);};
const message=error=>String(error?.message??error).slice(0,800);

export async function buildEthereumSupplyResolutionReport({repositoryRoot,informationCutoffAt,captureRoots=ETH_SUPPLY_RESOLUTION_ROOTS}={}){
  expect(typeof repositoryRoot==='string'&&isAbsolute(repositoryRoot),'Absolute repository root required');
  const root=await realpath(repositoryRoot),cutoff=supplyResolutionTimestamp(informationCutoffAt,'informationCutoffAt');
  expect(Array.isArray(captureRoots)&&captureRoots.length>0&&captureRoots.length<=8&&new Set(captureRoots).size===captureRoots.length&&captureRoots.every(safePath),'Invalid capture roots');
  const sourceRoots=[],inputFiles={},captures=[];let captureCount=0;
  async function read(path,maximumBytes){
    expect(safePath(path),'Unsafe supply evidence path');
    const file=resolve(root,path),info=await lstat(file),actual=await realpath(file),location=relative(root,actual);
    expect(info.isFile()&&!info.isSymbolicLink()&&!location.startsWith('..')&&!isAbsolute(location),'Supply evidence must be a regular file inside the repository');
    expect(info.size<=maximumBytes,'Supply evidence exceeds byte limit');
    const bytes=await readFile(actual);expect(bytes.length<=maximumBytes,'Supply evidence exceeds byte limit');
    const text=bytes.toString('utf8');expect(Buffer.from(text).equals(bytes),'Supply evidence is not UTF-8');
    const value=JSON.parse(text);inputFiles[path]={bytes:bytes.length,sha256:sha(bytes)};
    return {value,bytes};
  }
  for(const directory of captureRoots){
    let entries;
    try{
      const full=resolve(root,directory),info=await lstat(full),actual=await realpath(full),location=relative(root,actual);
      expect(info.isDirectory()&&!info.isSymbolicLink()&&!location.startsWith('..')&&!isAbsolute(location),'Capture root must be a directory inside the repository');
      entries=await readdir(actual,{withFileTypes:true});
    }
    catch(error){if(error.code==='ENOENT'){sourceRoots.push({path:directory,present:false});continue;}throw error;}
    sourceRoots.push({path:directory,present:true});
    for(const entry of entries.filter(entry=>entry.name.startsWith('capture-')).sort((a,b)=>a.name.localeCompare(b.name))){
      expect(++captureCount<=64,'Too many supply capture directories');
      const path=directory+'/'+entry.name,result={path,status:'started'};captures.push(result);
      try{
        expect(entry.isDirectory()&&/^capture-[A-Za-z0-9_-]+$/.test(entry.name),'Unsafe supply capture directory');
        let receipt;
        try{receipt=(await read(path+'/receipt.json',1024*1024)).value;}
        catch(error){if(error.code==='ENOENT'){result.status='source-unavailable';result.reason='Completed capture receipt is missing';continue;}throw error;}
        result.originalStatus=receipt.status;result.originalSourceCommit=receipt.sourceCommit??null;
        result.originalRunId=receipt.runId??null;result.originalCollectedAt=receipt.collectedAt??null;
        if(receipt.status!=='provider-accounting-audited'){
          result.status='source-unavailable';result.reason=receipt.error??'Original capture did not complete a provider accounting audit';continue;
        }
        expect(['eth-supply-accounting-audit-2','eth-supply-accounting-audit-3'].includes(receipt.version),'Unsupported original supply audit version');
        const collected=supplyResolutionTimestamp(receipt.collectedAt,'original collectedAt');
        expect(collected<=cutoff,'Original capture is after the information cutoff');
        const rows=receipt.rawFiles?.filter(item=>item.file==='history-30d.raw.json');
        expect(Array.isArray(rows)&&rows.length===1,'Original receipt must bind exactly one history document');
        const raw=rows[0];
        expect(raw.url===SOURCE.historyUrl&&raw.complete===true&&HEX.test(raw.sha256)&&Number.isSafeInteger(raw.bytes)&&raw.bytes>0,'Invalid original raw history binding');
        const captured=await read(path+'/history-30d.raw.json',8*1024*1024);
        expect(captured.bytes.length===raw.bytes&&sha(captured.bytes)===raw.sha256,'Original raw history bytes differ from receipt');
        const requests=receipt.network?.filter(item=>item.url===SOURCE.historyUrl);
        expect(Array.isArray(requests)&&requests.length===1,'Original history request binding is missing or ambiguous');
        const request=requests[0];
        expect(request.complete===true&&request.httpStatus===200&&request.receivedBytes===raw.bytes&&request.sha256===raw.sha256,'Original request does not bind the complete history bytes');
        const requested=supplyResolutionTimestamp(request.requestedAt,'original requestedAt');
        const received=supplyResolutionTimestamp(request.responseReceivedAt,'original responseReceivedAt');
        const completed=supplyResolutionTimestamp(request.completedAt,'original completedAt');
        expect(requested<=received&&received<=completed&&completed<=collected,'Original acquisition clocks are not ordered');
        const digest=request.responseHeaders?.['x-supply-sha256'];
        expect(digest==null||typeof digest==='string'&&/^[a-fA-F0-9]{64}$/.test(digest)&&digest.toLowerCase()===raw.sha256,'Provider digest differs from original bytes');
        expect(captured.value.range==='30d','Captured source URL and history range differ');
        const observedThrough=new Date((Math.floor(collected/86400)-1)*86400000).toISOString().slice(0,10);
        if(receipt.observation?.utcWindow?.observedThrough!==undefined)
          expect(receipt.observation.utcWindow.observedThrough===observedThrough,'Original target window differs from its collection day');
        result.diagnostic=analyzeEthereumSupplyResolution(captured.value,{collectedAt:receipt.collectedAt,observedThrough});
        result.raw={path:path+'/history-30d.raw.json',bytes:raw.bytes,sha256:raw.sha256,url:raw.url};
        result.status='diagnosed';
      }catch(error){result.status='invalid-source-evidence';result.error=message(error);}
    }
  }
  const diagnosed=captures.filter(row=>row.status==='diagnosed'),invalid=captures.filter(row=>row.status==='invalid-source-evidence');
  const body={schemaVersion:1,kind:'ethereum-supply-resolution-report',policy:ETH_SUPPLY_RESOLUTION_POLICY,
    informationCutoffAt,sourceRoots,inputFiles,captures,
    status:invalid.length?'invalid-source-evidence':diagnosed.length?'diagnosed':'source-unavailable',
    diagnosedCaptures:diagnosed.length,invalidSourceCaptures:invalid.length,
    unavailableCaptures:captures.filter(row=>row.status==='source-unavailable').length,
    sameGridConditionalIncompatibilityCount:diagnosed.filter(row=>row.diagnostic.utcAlignment.conditionalIncompatibilityProven).length,
    networkRequests:0,existingRawBytesChanged:false,modelInputActivated:false,fullModelSnapshotReady:false,
    eligibleModelSnapshotCount:0,independentCanonicalValidation:false,
    caveat:'Counts describe captured documents, not independent economic samples. Geometry is conditional on preserving the observed grid. Missing or failed sources do not become zero-valued observations.'};
  return {id:sha(Buffer.from(JSON.stringify(body))),...body};
}

async function main(){
  if(process.argv.length!==2)throw new Error('This replay command takes no options and performs no network requests');
  const root=fileURLToPath(new URL('..',import.meta.url)),sourceFiles={};
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  async function visit(path){
    if(Object.hasOwn(sourceFiles,path))return;
    const bytes=await readFile(resolve(root,path));sourceFiles[path]=sha(bytes);
    for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const dependency=relative(root,resolve(dirname(resolve(root,path)),match[1].split('?')[0])).replaceAll('\\','/');
      expect(safePath(dependency),'Supply resolution dependency leaves repository');await visit(dependency);
    }
  }
  await visit('scripts/analyze-ethereum-supply-resolution.mjs');
  if(git('status','--porcelain','--',...Object.keys(sourceFiles)))throw new Error('Commit the supply resolution source before reporting execution provenance');
  const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
  const report=await buildEthereumSupplyResolutionReport({repositoryRoot:root,informationCutoffAt:new Date().toISOString()});
  const result={report,provenance:{sourceCommit,sourceTree,sourceFiles,executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null}};
  await mkdir(resolve(root,'build'),{recursive:true});
  await writeFile(resolve(root,'build/ethereum-supply-resolution.json'),JSON.stringify(result,null,2)+'\n');
  console.log('ETH_SUPPLY_RESOLUTION_RECEIPT '+JSON.stringify(result));
  if(report.invalidSourceCaptures)throw new Error('Invalid preserved supply resolution evidence; inspect the saved report');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
