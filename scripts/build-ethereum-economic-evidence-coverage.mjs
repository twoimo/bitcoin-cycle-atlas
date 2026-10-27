/** Offline receipt/raw-byte inspector. It never collects or activates economic data. */
import {readFile,readdir,mkdir,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {inspectEthereumEconomicEvidence} from '../dist/ethereum-economic-evidence-coverage.js';
import {parseCoinMetricsEthCsv,assessCoinMetricsEconomicCoverage} from '../dist/ethereum-economic-data.js';
import {parseEthereumThroughput} from './capture-ethereum-throughput.mjs';
import {collectEthereumPowZeroCore} from './ethereum-pow-zero-core.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const PINNED='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const safeRelative=path=>typeof path==='string'&&path.length<1024&&!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').some(x=>x==='..'||x===''||x==='.')&&!/[\x00-\x1f]/.test(path);
function same(actual,expected,label){assert.deepEqual(actual,expected,label);}
async function exists(path){try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}

export async function inspectEconomicEvidenceFiles({repositoryRoot=ROOT,asOf,issuedAt,receiptBundlePath=null}={}){
  const root=await realpath(repositoryRoot),inputSha256={},inputs=[],sourceReceipts=[];
  // repositoryRoot selects input artifacts only. Executable code comes from the
  // static imports above and is hashed at ROOT, including in temporary test roots.
  const usedSourceFiles=new Set(['dist/ethereum-economic-evidence-coverage.js','dist/ethereum-economic-model.js','dist/ethereum-economic-data.js','scripts/build-ethereum-economic-evidence-coverage.mjs','scripts/capture-ethereum-throughput.mjs','scripts/ethereum-pow-zero-core.mjs']);
  async function read(path){
    assert(safeRelative(path),'Unsafe evidence path');
    const actual=await realpath(resolve(root,path));
    assert(!relative(root,actual).startsWith('..')&&!isAbsolute(relative(root,actual)),'Evidence path leaves the repository');
    const metadata=await stat(actual);assert(metadata.isFile()&&metadata.size<=32*1024*1024,'Evidence file is not a bounded regular file');
    const bytes=await readFile(actual);inputSha256[path]=sha(bytes);return bytes;
  }
  async function add(kind,path,{directory=null,bundleIndex=null,retained=false}={}){
    const bytes=await read(path),document=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    const receipt=bundleIndex===null?document:document[bundleIndex.key][bundleIndex.index];
    const source={kind,receipt,receiptPath:path+(bundleIndex?'#'+bundleIndex.key+'['+bundleIndex.index+']':''),receiptSha256:sha(bytes),rawAudit:{status:'not-loaded',replayed:false}};
    inputs.push({kind,path:source.receiptPath,sha256:sha(bytes),retained});sourceReceipts.push(source);
    let rawDirectory=directory;
    if(kind==='coinmetrics'&&receipt.status==='success'){
      let csvPath=rawDirectory?rawDirectory+'/coinmetrics-eth.csv':PINNED+'/eth.csv';
      if(rawDirectory===PINNED)csvPath=PINNED+'/eth.csv';
      if(!await exists(resolve(root,csvPath))){source.rawAudit.status='missing';return;}
      const csv=await read(csvPath);
      same(sha(csv),receipt.sourceSha256,'CSV differs from capture receipt');
      same(blob(csv),receipt.source.expectedGitBlobSha,'CSV Git blob mismatch');
      same(csv.length,receipt.source.expectedBytes,'CSV byte count mismatch');
      const parsed=parseCoinMetricsEthCsv(new TextDecoder('utf-8',{fatal:true}).decode(csv));
      const coverage=assessCoinMetricsEconomicCoverage(parsed,{asOf:receipt.asOf,collectedAt:receipt.collectedAt});
      same(coverage.latestCompleteWindow,receipt.summary.latestCompleteWindow,'Coin Metrics receipt aggregate does not replay');
      source.rawAudit={status:'verified',replayed:true,verifiedFiles:1};return;
    }
    if(!rawDirectory)return;
    if(!['supplement-collected','partial-protocol-observation-collected'].includes(receipt.status))return;
    const files=new Map();
    assert(Array.isArray(receipt.rawFiles)&&receipt.rawFiles.length<=80,'Missing/bounded raw manifest required');
    for(const file of receipt.rawFiles){
      const name=file.path??file.file;
      assert(safeRelative(name)&&!files.has(name),'Unsafe or duplicate raw manifest path');
      assert(/^[a-f0-9]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>0,'Invalid raw manifest identity');
      const bytes=await read(rawDirectory+'/'+name);same(sha(bytes),file.sha256,'Raw SHA-256 mismatch: '+name);same(bytes.length,file.bytes,'Raw length mismatch: '+name);files.set(name,bytes);
    }
    assert(files.size>0,'Empty raw manifest');
    if(kind==='throughput'){
      const replay=parseEthereumThroughput(JSON.parse(files.get('master.raw.json')),JSON.parse(files.get('throughput.raw.json')),{collectedAt:receipt.observation.collectedAt});
      same(replay,receipt.observation,'Throughput receipt observation does not replay');
    }else if(kind==='pow-zero'){
      for(const source of receipt.observation.sourceManifest){
        const bytes=files.get('sources/'+source.id+'.raw');assert(bytes,'Missing pinned PoW specification');
        same(blob(bytes),source.blobSha,'PoW specification Git blob mismatch');same(sha(bytes),source.sourceSha256,'PoW specification SHA-256 mismatch');same(bytes.length,source.bytes,'PoW specification length mismatch');
      }
      const requests=receipt.requests.filter(r=>r.method==='POST');let index=0;
      const replay=await collectEthereumPowZeroCore({observedThrough:receipt.observation.observedThrough,captureStartedAt:receipt.observation.captureStartedAt,
        clock:()=>receipt.observation.collectedAt,sourceManifests:receipt.observation.sourceManifest,
        read:async(method,params)=>{
          const request=requests[index++];assert(request,'Replay exceeded preserved RPC transcript');
          const body=JSON.parse(request.requestBody);same(body.method,method,'Replay method differs');same(body.params,params,'Replay params differ');
          const bytes=files.get(request.path);assert(bytes,'Missing RPC raw response');same(sha(bytes),request.sha256,'RPC request manifest differs');
          const response=JSON.parse(bytes);same(response.id,body.id,'RPC response ID mismatch');same(response.jsonrpc,'2.0','Invalid RPC envelope');
          assert(!Object.hasOwn(response,'error')&&Object.hasOwn(response,'result')&&response.result!==null,'Invalid RPC result');return response.result;
        }});
      same(index,requests.length,'Unconsumed RPC transcript');same(replay,receipt.observation,'PoW receipt observation does not replay');
    }
    source.rawAudit={status:'verified',replayed:true,verifiedFiles:files.size};
  }
  if(receiptBundlePath){
    const bytes=await read(receiptBundlePath),bundle=JSON.parse(bytes);
    for(const [key,kind]of [['pinnedSource','coinmetrics'],['throughput','throughput'],['pow','pow-zero']]){
      assert(Array.isArray(bundle[key]),'Receipt bundle missing '+key);
      for(let index=0;index<bundle[key].length;index++)await add(kind,receiptBundlePath,{bundleIndex:{key,index},retained:true});
    }
  }else{
    for(const [kind,parent]of [['coinmetrics','build/ethereum-economic-data'],['throughput','build/ethereum-throughput-supplement']]){
      if(!await exists(resolve(root,parent)))continue;
      const entries=(await readdir(resolve(root,parent),{withFileTypes:true})).filter(x=>x.isDirectory()&&/^capture-[A-Za-z0-9_-]+$/.test(x.name)).sort((a,b)=>a.name.localeCompare(b.name));
      assert(entries.length<=30,'Too many capture directories; choose a retained bundle');
      for(const entry of entries){const directory=parent+'/'+entry.name;if(await exists(resolve(root,directory+'/receipt.json')))await add(kind,directory+'/receipt.json',{directory});}
    }
    if(!sourceReceipts.some(s=>s.kind==='coinmetrics')&&await exists(resolve(root,PINNED+'/receipt.json')))await add('coinmetrics',PINNED+'/receipt.json',{directory:PINNED,retained:true});
    const pow='build/ethereum-pow-zero';if(await exists(resolve(root,pow+'/receipt.json')))await add('pow-zero',pow+'/receipt.json',{directory:pow});
  }
  const report=inspectEthereumEconomicEvidence({asOf,issuedAt,sources:sourceReceipts});
  const sourceHashes={};
  for(const path of usedSourceFiles){const bytes=await readFile(resolve(ROOT,path));sourceHashes[path]=sha(bytes);inputSha256[path]=sha(bytes);}
  let sourceCommit=null,sourceTree=null,sourceIdentityStatus='unavailable';
  try{
    const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']}).trim();
    sourceCommit=git('rev-parse','HEAD');sourceTree=git('rev-parse','HEAD^{tree}');
    assert(/^[a-f0-9]{40}$/.test(sourceCommit)&&/^[a-f0-9]{40}$/.test(sourceTree),'Invalid checkout identity');sourceIdentityStatus='verified-checkout';
  }catch(error){if(process.env.GITHUB_ACTIONS==='true')throw error;}
  return {...report,sourceCommit,sourceTree,sourceIdentityStatus,sourceHashes,provenance:{inputSha256,receiptInputs:inputs,networkRequests:0,executionSource:'static imports at the inspector source root; repositoryRoot selects input artifacts only',rawByteVerificationIsNotPublicationProof:true,
    retainedReceiptCollectionTimesUnchanged:true,generatedAt:new Date().toISOString()}};
}

async function main(){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){
    assert(['--as-of','--issued-at','--receipt-bundle'].includes(args[i])&&args[i+1]&&!Object.hasOwn(options,args[i]),'Usage: [--as-of YYYY-MM-DD] [--issued-at UTC] [--receipt-bundle relative/path.json]');
    options[args[i]]=args[i+1];
  }
  const issuedAt=options['--issued-at']??new Date().toISOString(),asOf=options['--as-of']??new Date(Math.floor(Date.parse(issuedAt)/86400000)*86400000-86400000).toISOString().slice(0,10);
  const report=await inspectEconomicEvidenceFiles({asOf,issuedAt,receiptBundlePath:options['--receipt-bundle']??null});
  const path='build/ethereum-economic-evidence-coverage.json',output=resolve(ROOT,path),bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,bytes);
  console.log('ETH_ECONOMIC_EVIDENCE_COVERAGE_RECEIPT '+JSON.stringify({kind:report.kind,version:report.version,sourceCommit:report.sourceCommit,sourceTree:report.sourceTree,
    sourceIdentityStatus:report.sourceIdentityStatus,sourceHashes:report.sourceHashes,asOf:report.asOf,issuedAt:report.issuedAt,summary:report.summary,
    provenance:report.provenance,fullModelSnapshotReady:false,modelInputActivated:false,output,bytes:bytes.length,sha256:sha(bytes)}));
  const base64=bytes.toString('base64'),chunkSize=11000,total=Math.ceil(base64.length/chunkSize);
  for(let index=0;index<total;index++)console.log('ETH_ECONOMIC_EVIDENCE_COVERAGE_PART '+JSON.stringify({path,bytes:bytes.length,sha256:sha(bytes),index,total,base64:base64.slice(index*chunkSize,(index+1)*chunkSize)}));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
