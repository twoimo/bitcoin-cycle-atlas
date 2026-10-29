// A partial protocol observation, never an economic-model input snapshot.
// Raw byte verification, network budgets and receipts belong to the collector.
export const POW_ZERO_SOURCES=Object.freeze([
  {id:'eip-3675',repository:'ethereum/EIPs',ref:'7372d10a457b29eceb02cd052345af165de1fb60',path:'EIPS/eip-3675.md',blobSha:'efa51f543490bd6643fa943fb963d762312bda2a'},
  {id:'eip-4399',repository:'ethereum/EIPs',ref:'7372d10a457b29eceb02cd052345af165de1fb60',path:'EIPS/eip-4399.md',blobSha:'eb7d731fa68ab1a7f52085f6ea5be79045ce6bc3'},
  {id:'mainnet-fork-clock',repository:'ethereum/consensus-specs',ref:'ff73f4dd90a8717b13ed5a52afa5c1af358259b5',path:'configs/mainnet.yaml',blobSha:'3dadbd7433b69a45669cdd2459fee41653cd2ac1'}
].map(s=>Object.freeze({...s,url:'https://github.com/'+s.repository+'/blob/'+s.ref+'/'+s.path,rawUrl:'https://raw.githubusercontent.com/'+s.repository+'/'+s.ref+'/'+s.path})));
export const POW_ZERO_POLICY=Object.freeze({version:'eth-pow-zero-observation-1',endpoint:'https://ethereum-rpc.publicnode.com',terminal:15537393,transition:15537394,maximumHeadExclusive:2**28,maximumSearchReads:51,maximumCoreRpcReads:61,windowDays:28});
const DAY=86400000,TTD=58750000000000000000000n;
export const EMPTY_OMMERS='0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347';
function check(ok,message){if(!ok)throw new RangeError(message);}
function instant(value,label){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),label+' must be an explicit UTC timestamp');
  const time=Date.parse(value);check(Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===value.slice(0,19),label+' is invalid');return time;
}
function day(value){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'observedThrough must be a UTC day');
  const time=Date.parse(value+'T00:00:00Z');check(Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value,'Invalid UTC day');return time;
}
function quantity(value,label){check(typeof value==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value),label+': invalid RPC quantity');return BigInt(value);}
function safe(value,label){const n=quantity(value,label);check(n<=BigInt(Number.MAX_SAFE_INTEGER),label+': overflow');return Number(n);}
function hash(value,label){check(typeof value==='string'&&/^0x[0-9a-f]{64}$/i.test(value)&&!/^0x0{64}$/i.test(value),label+': invalid block hash');return value.toLowerCase();}
function sources(manifests){
  check(Array.isArray(manifests),'Source manifests required');
  check(new Set(manifests.map(s=>s.id)).size===manifests.length,'Duplicate source identity');
  return POW_ZERO_SOURCES.map(s=>{
    const m=manifests.find(m=>m.id===s.id);
    check(m?.url===s.url&&m.blobSha===s.blobSha&&/^[a-f0-9]{64}$/.test(m.sourceSha256)&&Number.isSafeInteger(m.bytes)&&m.bytes>0,'Missing or mismatched source manifest: '+s.id);
    return {id:s.id,url:s.url,blobSha:s.blobSha,sourceSha256:m.sourceSha256,bytes:m.bytes};
  });
}
export function validateEthereumPowZeroBlock(raw,expectedNumber=null){
  check(raw&&typeof raw==='object'&&!Array.isArray(raw),'Missing RPC block');
  const number=safe(raw.number,'number'),timestamp=safe(raw.timestamp,'timestamp');
  check(number<POW_ZERO_POLICY.maximumHeadExclusive&&timestamp>0,'Block outside core bounds');
  check(expectedNumber===null||number===expectedNumber,'RPC returned another block number');
  const block={number,timestamp,hash:hash(raw.hash,'hash'),parentHash:hash(raw.parentHash,'parentHash'),difficulty:quantity(raw.difficulty,'difficulty'),nonce:raw.nonce,sha3Uncles:hash(raw.sha3Uncles,'sha3Uncles'),totalDifficulty:raw.totalDifficulty==null?null:quantity(raw.totalDifficulty,'totalDifficulty')};
  check(typeof block.nonce==='string'&&/^0x[0-9a-f]{16}$/i.test(block.nonce),'Invalid block nonce');
  check(Array.isArray(raw.uncles),'Missing uncle list');
  if(number>=POW_ZERO_POLICY.transition)check(block.difficulty===0n&&block.nonce.toLowerCase()==='0x0000000000000000'&&block.sha3Uncles===EMPTY_OMMERS&&raw.uncles.length===0,'Required post-Merge header form is missing');
  else check(block.difficulty>0n,'Historical PoW anchor lacks difficulty');
  // EIP-4399 gives mixHash a RANDAO meaning; it must not be forced to zero.
  return block;
}
function identity(b){return [b.number,b.timestamp,b.hash,b.parentHash,b.difficulty.toString(),b.nonce.toLowerCase(),b.sha3Uncles,b.totalDifficulty?.toString()??null].join('|');}
function linked(p,c){check(c.number===p.number+1&&c.parentHash===p.hash&&c.timestamp>p.timestamp,'Adjacent boundary/transition blocks are inconsistent');}
function summary(b){return {number:b.number,hash:b.hash,parentHash:b.parentHash,timestampSeconds:b.timestamp,difficulty:b.difficulty.toString(),nonce:b.nonce,sha3Uncles:b.sha3Uncles,totalDifficulty:b.totalDifficulty?.toString()??null};}

export async function collectEthereumPowZeroCore({read,observedThrough,captureStartedAt,clock,sourceManifests}){
  check(typeof read==='function'&&typeof clock==='function','Injected read and capture clock required');
  const manifests=sources(sourceManifests),started=instant(captureStartedAt,'captureStartedAt'),endDay=day(observedThrough);
  const startMs=endDay-27*DAY,endMs=endDay+DAY,today=Math.floor(started/DAY)*DAY;
  check(endMs<=started&&(today-endDay)/DAY<=7,'Requested window is incomplete or stale');
  check(startMs>=Date.parse('2022-09-16T00:00:00Z'),'Only fully post-Merge UTC windows are supported');
  let queryCount=0,searchReads=0;const cache=new Map();
  async function request(method,params){check(queryCount<POW_ZERO_POLICY.maximumCoreRpcReads,'Core RPC query budget exhausted');queryCount++;return read(method,params);}
  function remember(block){
    for(const [n,previous]of cache){
      if(n===block.number)check(identity(previous)===identity(block),'Canonical block identity changed during capture');
      else check(n<block.number?previous.timestamp<block.timestamp:previous.timestamp>block.timestamp,'Sampled canonical timestamps are not strictly monotonic');
    }
    cache.set(block.number,block);return block;
  }
  async function numbered(n,{fresh=false,searching=false}={}){
    if(!fresh&&cache.has(n))return cache.get(n);
    if(searching){check(searchReads<POW_ZERO_POLICY.maximumSearchReads,'Boundary search budget exhausted; no observation produced');searchReads++;}
    return remember(validateEthereumPowZeroBlock(await request('eth_getBlockByNumber',['0x'+n.toString(16),false]),n));
  }
  check(quantity(await request('eth_chainId',[]),'chainId')===1n,'RPC is not reporting Ethereum mainnet');
  const terminalParent=await numbered(POW_ZERO_POLICY.terminal-1),terminal=await numbered(POW_ZERO_POLICY.terminal),transition=await numbered(POW_ZERO_POLICY.transition);
  linked(terminalParent,terminal);linked(terminal,transition);
  const ptd=terminalParent.totalDifficulty,ttd=terminal.totalDifficulty;
  if(ptd!==null)check(ptd<TTD,'Parent already reached TTD');
  if(ttd!==null)check(ttd>=TTD,'Terminal block below TTD');
  if(ptd!==null&&ttd!==null)check(ttd===ptd+terminal.difficulty,'TTD sum inconsistent');
  if(ttd!==null&&transition.totalDifficulty!==null)check(transition.totalDifficulty===ttd,'Transition changed total difficulty');
  const ttdThresholdComparison=ptd!==null&&ttd!==null?'observed-and-consistent':'unavailable-rpc-fields';
  const finalized=remember(validateEthereumPowZeroBlock(await request('eth_getBlockByNumber',['finalized',false])));
  check(finalized.number>POW_ZERO_POLICY.transition&&finalized.timestamp*1000>=endMs&&finalized.timestamp*1000<=started&&transition.timestamp*1000<startMs,'Finalized/transition temporal coverage failed');
  async function boundary(target){
    let low=POW_ZERO_POLICY.transition,high=finalized.number;
    while(high-low>1){
      const middle=low+Math.floor((high-low)/2),block=await numbered(middle,{searching:true});
      if(block.timestamp<target)low=middle;else high=middle;
    }
    const previous=cache.get(low),next=cache.get(high);check(previous&&next,'Internal boundary evidence missing');linked(previous,next);
    check(previous.timestamp<target&&next.timestamp>=target,'UTC boundary not bracketed by adjacent blocks');
    return {previous,next};
  }
  const firstEdge=await boundary(startMs/1000),lastEdge=await boundary(endMs/1000);
  const first=firstEdge.next,last=lastEdge.previous;
  check(first.number<=last.number&&first.number>=POW_ZERO_POLICY.transition&&last.number<finalized.number,'Empty or unfinalized block interval');
  const recheckedNumbers=[...new Set([firstEdge.previous.number,first.number,last.number,lastEdge.next.number,finalized.number])];
  for(const n of recheckedNumbers)await numbered(n,{fresh:true});
  const collectedAt=clock(),collected=instant(collectedAt,'collectedAt');
  check(collected>=started&&collected>=endMs,'Capture clock moved backwards');
  return {
    status:'partial-protocol-observation-collected',sourceType:'protocol-computed-zero',policy:POW_ZERO_POLICY,
    metricDefinitionVersion:'eth-economic-input-3',partialMetrics:{executionPowIssuanceEth:{value:0,unit:'ETH/28 UTC days'}},
    metricSourceUrls:{executionPowIssuanceEth:POW_ZERO_POLICY.endpoint},
    observedThrough,windowStart:new Date(startMs).toISOString().slice(0,10),windowDays:28,completeWindow:true,captureStartedAt,collectedAt,publishedAt:null,
    canonicalBlockRange:{first:summary(first),last:summary(last)},boundaryEvidence:{startPrevious:summary(firstEdge.previous),endNext:summary(lastEdge.next)},
    transitionEvidence:{terminalParent:summary(terminalParent),terminal:summary(terminal),transition:summary(transition),configuredTerminalTotalDifficulty:TTD.toString(),ttdThresholdComparison},
    finalizedAnchor:summary(finalized),recheckedBlockNumbers:recheckedNumbers,queryCount,searchCacheMisses:searchReads,
    providerCount:1,providerCanonicalAssertion:true,independentConsensusValidation:false,completeHeaderChainVerified:false,
    sourceManifest:manifests,sourceManifestByteVerificationPerformedBy:'caller',
    definitionMatchedPartialMetricCount:1,pointInTimeEligibleMetricCount:0,requiredMetricCount:25,
    fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,historicalPointInTimeReady:false,modelInputActivated:false,modelSnapshots:[],
    zeroBasis:'EIP-3675 rule applied to the provider-asserted canonical post-transition range; not total ETH issuance.'
  };
}
