import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const API_REF='79b9b05e354da4f80d8f18879871af6f0068108d';
const UINT64_MAX=(1n<<64n)-1n,ROOT=/^0x[a-f0-9]{64}$/;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const ETH_STAKING_COHORT_POLICY=Object.freeze({
  version:'eth-fixed-staking-cohort-state-1',
  endpoint:'https://ethereum-beacon-api.publicnode.com',
  cohortId:'ethereum-mainnet-validator-indices-0-through-7-v1',
  validatorIndices:Object.freeze(['0','1','2','3','4','5','6','7']),
  genesisTime:'1606824023',genesisForkVersion:'0x00000000',
  genesisValidatorsRoot:'0x4b363db94e286120d76eb905340fdd4e54bfe9f06bf33ff6cf5ad27f511bfe95',
  secondsPerSlot:12,slotsPerEpoch:32,maximumResponseBytes:262144,
  selection:'First eight registry indices fixed before observing their current balances/statuses. A mechanism sample, not a representative investor or network cohort.',
});
export const ETH_STAKING_COHORT_TRANSPORT=Object.freeze({maximumRequests:3,maximumResponseBytes:262144,maximumTotalBytes:786432,requestTimeoutMs:15000,totalTimeoutMs:45000,retries:0,redirects:'error'});

/** Capture and replay accept the same reduced byte/time budgets. Request count,
 * retries and redirect behavior remain fixed, and unknown policy keys fail. */
export function validateEthereumStakingCohortTransport(value){
  object(value,'cohort transport policy');
  const keys=Object.keys(ETH_STAKING_COHORT_TRANSPORT);
  if(!isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort()))throw new Error('Cohort transport policy fields do not match the allowed contract');
  for(const key of ['maximumRequests','maximumResponseBytes','maximumTotalBytes','requestTimeoutMs','totalTimeoutMs'])
    if(!Number.isSafeInteger(value[key])||value[key]<1||value[key]>ETH_STAKING_COHORT_TRANSPORT[key])throw new RangeError('Invalid bounded cohort transport '+key);
  if(value.maximumRequests!==3||value.retries!==0||value.redirects!=='error')throw new Error('Cohort transport requires exactly three allowed GETs with no retry/redirect');
  return Object.freeze(Object.fromEntries(keys.map(key=>[key,value[key]])));
}
export const ETH_STAKING_COHORT_SOURCES=Object.freeze([
  {id:'mainnet-genesis',url:'https://github.com/eth-clients/mainnet/blob/8cad4805e9cb5aa5e8e74d30e3f5029a7f133372/README.md',gitBlobSha:'074fe44aaaf9561208b029c91671e499dc0af2f9'},
  {id:'beacon-validator-response',url:'https://github.com/ethereum/beacon-APIs/blob/'+API_REF+'/apis/beacon/states/validators.yaml',gitBlobSha:'35483ffe84a2188527278ed629833827c26fcee8'},
  {id:'beacon-validator-fields',url:'https://github.com/ethereum/beacon-APIs/blob/'+API_REF+'/types/phase0/validator.yaml',gitBlobSha:'af179086193b8f1a8e75c5f59837e4345972adb3'},
  {id:'beacon-status-schema',url:'https://github.com/ethereum/beacon-APIs/blob/'+API_REF+'/types/api.yaml',gitBlobSha:'f92e59bae3d4279b52969b49b58ed2fb5adc5bf3'},
  {id:'beacon-header-response',url:'https://github.com/ethereum/beacon-APIs/blob/'+API_REF+'/apis/beacon/blocks/header.yaml',gitBlobSha:'9c192999a50d8161389759e62cb64a531a4bd951'},
  {id:'withdrawals-transfer',url:'https://eips.ethereum.org/EIPS/eip-4895'},
  {id:'compounding-and-consolidation',url:'https://eips.ethereum.org/EIPS/eip-7251'},
]);
export function stakingCohortUrl(kind,stateRoot=null){
  const base=ETH_STAKING_COHORT_POLICY.endpoint;
  if(kind==='genesis')return base+'/eth/v1/beacon/genesis';
  if(kind==='header')return base+'/eth/v1/beacon/headers/finalized';
  if(kind==='validators'&&ROOT.test(stateRoot))return base+'/eth/v1/beacon/states/'+stateRoot+'/validators?id='+ETH_STAKING_COHORT_POLICY.validatorIndices.join(',');
  throw new TypeError('Unknown fixed cohort endpoint or invalid pinned state root');
}
function object(value,name){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError(name+' must be an object');return value;}
function uint64(value,name){
  if(typeof value!=='string'||!/^(?:0|[1-9][0-9]{0,19})$/.test(value)||BigInt(value)>UINT64_MAX)throw new RangeError(name+' must be a canonical uint64 decimal string');
  return BigInt(value);
}
function hex(value,bytes,name){if(typeof value!=='string'||!new RegExp('^0x[a-f0-9]{'+bytes*2+'}$').test(value))throw new TypeError(name+' must be lowercase fixed-width hex');return Buffer.from(value.slice(2),'hex');}
function clock(value,name){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw new TypeError(name+' needs a timezone-qualified timestamp');
  const calendar=value.slice(0,10),date=new Date(calendar+'T00:00:00Z'),ms=Date.parse(value);
  if(!Number.isFinite(ms)||!Number.isFinite(+date)||date.toISOString().slice(0,10)!==calendar||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59)throw new RangeError(name+' has an invalid calendar/clock');
  return ms;
}
function rawEvidence(input,expectedUrl,captureStartedAt,finishedAt){
  object(input,'acquisition');
  if(input.url!==expectedUrl||input.httpStatus!==200||input.complete!==true)throw new Error('Expected one complete HTTP200 acquisition from the exact endpoint');
  if(!(input.bytes instanceof Uint8Array)||!input.bytes.length||input.bytes.length>ETH_STAKING_COHORT_POLICY.maximumResponseBytes)throw new RangeError('Raw cohort body is absent or exceeds its byte bound');
  const start=clock(input.startedAt,'request startedAt'),end=clock(input.collectedAt,'collectedAt');
  if(start<clock(captureStartedAt,'captureStartedAt')||end<start||end>clock(finishedAt,'finishedAt'))throw new RangeError('Invalid actual acquisition chronology');
  const bytes=Buffer.from(input.bytes),value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  return {value:object(value,'API response'),receipt:{url:input.url,httpStatus:200,startedAt:input.startedAt,collectedAt:input.collectedAt,publishedAt:null,bytes:bytes.length,sha256:digest(bytes)},start,end};
}
function confirmed(value,name){if(value.execution_optimistic!==false||value.finalized!==true)throw new Error(name+' must explicitly report finalized and nonoptimistic data');}
export function beaconHeaderMessageRoot(message){
  object(message,'BeaconBlockHeader');
  const chunk=value=>{const bytes=Buffer.alloc(32);bytes.writeBigUInt64LE(value);return bytes;};
  let level=[chunk(uint64(message.slot,'slot')),chunk(uint64(message.proposer_index,'proposer_index')),
    hex(message.parent_root,32,'parent_root'),hex(message.state_root,32,'state_root'),hex(message.body_root,32,'body_root'),Buffer.alloc(32),Buffer.alloc(32),Buffer.alloc(32)];
  while(level.length>1)level=Array.from({length:level.length/2},(_,i)=>createHash('sha256').update(level[2*i]).update(level[2*i+1]).digest());
  return '0x'+level[0].toString('hex');
}
export function inspectEthereumStakingCohortHeader({genesis,header,captureStartedAt,finishedAt}={}){
  const g=rawEvidence(genesis,stakingCohortUrl('genesis'),captureStartedAt,finishedAt),h=rawEvidence(header,stakingCohortUrl('header'),captureStartedAt,finishedAt);
  const data=object(g.value.data,'genesis data'),p=ETH_STAKING_COHORT_POLICY;
  if(data.genesis_time!==p.genesisTime||data.genesis_validators_root!==p.genesisValidatorsRoot||data.genesis_fork_version!==p.genesisForkVersion)throw new Error('Beacon genesis does not match the pinned Ethereum mainnet identity');
  confirmed(h.value,'Header');const d=object(h.value.data,'header data'),signed=object(d.header,'signed header'),message=object(signed.message,'header message');
  if(d.canonical!==true)throw new Error('Provider must explicitly assert the header canonical');
  hex(signed.signature,96,'signature');hex(d.root,32,'header root');
  if(beaconHeaderMessageRoot(message)!==d.root)throw new Error('Beacon header SSZ message root mismatch');
  const slot=uint64(message.slot,'slot'),seconds=BigInt(p.genesisTime)+slot*BigInt(p.secondsPerSlot);
  if(seconds>BigInt(Math.floor(h.end/1000)))throw new RangeError('Header observation lies after its actual collection');
  const observedAt=new Date(Number(seconds)*1000).toISOString();
  return {genesis:g.receipt,header:h.receipt,state:{slot:message.slot,epoch:(slot/32n).toString(),observedAt,
    blockRoot:d.root,stateRoot:message.state_root,parentRoot:message.parent_root,bodyRoot:message.body_root,proposerIndex:message.proposer_index,
    providerCanonicalAssertion:true,providerFinalizedAssertion:true,executionOptimistic:false,headerSszRootMatched:true,
    headerSignatureAuthenticated:false,independentFinalityProven:false,validatorStateMembershipProven:false}};
}
function statusAt(validator,balance,epoch){
  const eligible=uint64(validator.activation_eligibility_epoch,'activation_eligibility_epoch'),active=uint64(validator.activation_epoch,'activation_epoch'),exit=uint64(validator.exit_epoch,'exit_epoch'),withdraw=uint64(validator.withdrawable_epoch,'withdrawable_epoch');
  if(eligible>active||active>exit||exit>withdraw)throw new Error('Validator epoch ordering is inconsistent');
  if(active>epoch)return eligible===UINT64_MAX?'pending_initialized':'pending_queued';
  if(epoch<exit)return validator.slashed?'active_slashed':exit===UINT64_MAX?'active_ongoing':'active_exiting';
  if(epoch<withdraw)return validator.slashed?'exited_slashed':'exited_unslashed';
  return balance===0n?'withdrawal_done':'withdrawal_possible';
}
export function gweiToExactEth(value){const n=typeof value==='bigint'?value:uint64(value,'gwei');if(n<0n)throw new RangeError('Negative balance');const whole=n/1000000000n,fraction=(n%1000000000n).toString().padStart(9,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'');}

/** One provider's root-pinned state sample. No reward inference, state proof,
 * independently authenticated finality or network-wide extrapolation occurs. */
export function inspectEthereumStakingCohort({genesis,header,validators,captureStartedAt,finishedAt}={}){
  const anchor=inspectEthereumStakingCohortHeader({genesis,header,captureStartedAt,finishedAt}),v=rawEvidence(validators,stakingCohortUrl('validators',anchor.state.stateRoot),captureStartedAt,finishedAt);
  if(v.start<Math.max(clock(header.collectedAt,'header collectedAt'),clock(genesis.collectedAt,'genesis collectedAt')))throw new Error('Validator request predates acquisition of its pinned state root or genesis identity');
  confirmed(v.value,'Validator response');
  const requested=ETH_STAKING_COHORT_POLICY.validatorIndices,rows=v.value.data;
  if(!Array.isArray(rows)||rows.length!==requested.length)throw new Error('Fixed cohort is incomplete or contains extra validators');
  const seen=new Set(),pubkeys=new Set(),epoch=BigInt(anchor.state.epoch),normalized=[];
  for(const row of rows){
    object(row,'validator response');const index=uint64(row.index,'validator index').toString();
    if(!requested.includes(index)||seen.has(index))throw new Error('Unexpected or duplicate validator index');seen.add(index);
    const validator=object(row.validator,'validator'),balance=uint64(row.balance,'balance'),effective=uint64(validator.effective_balance,'effective_balance');
    hex(validator.pubkey,48,'validator pubkey');hex(validator.withdrawal_credentials,32,'withdrawal_credentials');
    if(pubkeys.has(validator.pubkey))throw new Error('Duplicate validator public key');pubkeys.add(validator.pubkey);
    if(typeof validator.slashed!=='boolean')throw new TypeError('slashed must be boolean');
    const derivedStatus=statusAt(validator,balance,epoch);if(row.status!==derivedStatus)throw new Error('Validator status disagrees with its epoch/balance fields');
    normalized.push({index,status:row.status,pubkey:validator.pubkey,withdrawalCredentials:validator.withdrawal_credentials,withdrawalCredentialPrefix:validator.withdrawal_credentials.slice(0,4),
      actualBalanceGwei:balance.toString(),actualBalanceEth:gweiToExactEth(balance),effectiveBalanceGwei:effective.toString(),effectiveBalanceEth:gweiToExactEth(effective),slashed:validator.slashed,
      activationEligibilityEpoch:validator.activation_eligibility_epoch,activationEpoch:validator.activation_epoch,exitEpoch:validator.exit_epoch,withdrawableEpoch:validator.withdrawable_epoch});
  }
  normalized.sort((a,b)=>Number(BigInt(a.index)-BigInt(b.index)));
  const sum=(rows,key)=>rows.reduce((n,row)=>n+BigInt(row[key]),0n),active=normalized.filter(row=>row.status.startsWith('active_'));
  const actual=sum(normalized,'actualBalanceGwei'),effective=sum(normalized,'effectiveBalanceGwei'),activeActual=sum(active,'actualBalanceGwei'),activeEffective=sum(active,'effectiveBalanceGwei');
  return {schemaVersion:1,kind:'ethereum-fixed-staking-cohort-state-partial',version:ETH_STAKING_COHORT_POLICY.version,
    cohortId:ETH_STAKING_COHORT_POLICY.cohortId,selection:ETH_STAKING_COHORT_POLICY.selection,requestedValidatorIndices:[...requested],capturedValidatorCount:normalized.length,
    captureStartedAt,finishedAt,publishedAt:null,collectedAt:validators.collectedAt,state:anchor.state,
    acquisition:[anchor.genesis,anchor.header,v.receipt],validators:normalized,
    totals:{unit:'gwei at the pinned state, not time-weighted principal',actualBalanceGwei:actual.toString(),actualBalanceEth:gweiToExactEth(actual),
      effectiveBalanceGwei:effective.toString(),effectiveBalanceEth:gweiToExactEth(effective),activeValidatorCount:active.length,
      activeActualBalanceGwei:activeActual.toString(),activeEffectiveBalanceGwei:activeEffective.toString(),
      activeCountTimes32Eth:(BigInt(active.length)*32n).toString(),activeCountTimes32MatchesEffective:BigInt(active.length)*32000000000n===activeEffective},
    earnedReturn:null,timeWeightedRewardEligiblePrincipal:null,completedExitWait:null,networkStakedEth:null,
    fullUtcWindowObserved:false,stakingCohortRepresentative:false,historicalAvailabilityProven:false,
    definitionMatchedModelMetricCount:0,eligibleModelSnapshotCount:0,fullModelSnapshotReady:false,modelInputActivated:false,
    requiredBeforeEconomicUse:[
      'A fixed economically identified cohort; eight registry indices are not a representative staking or investor universe.',
      'Exact UTC boundary states and every relevant state transition across the full 28-day window.',
      'Separate actual earned consensus rewards/penalties from deposits, withdrawals and consolidation principal crossing cohort boundaries.',
      'Reconcile execution priority fees and additional MEV without counting builder payments twice.',
      'Measured service fees, remaining operating costs and dated conversions for precisely the same cohort.',
      'Time-weighted reward-eligible principal; neither one ending actual balance nor count times 32 ETH is the denominator.',
      'Accepted full-exit request and execution-availability histories; one withdrawal_done state supplies no waiting duration.',
      'Authenticated canonical states or membership proofs and independent finality checks; header hashing alone is insufficient.',
    ],
    limitations:[
      'SSZ message-root equality binds header fields only. The validator JSON has no state Merkle proof; provider root lookup and finality remain provider assertions.',
      'Public keys and withdrawal credentials are protocol identifiers, not independently established beneficial ownership.',
      'Endpoint fields and receipt clocks do not authenticate past publication or turn a current snapshot into a historical vintage.',
    ]};
}

/** Offline consistency replay of a successful bounded collector receipt. Hashes
 * detect changed bytes; they do not authenticate the provider or its history. */
export function replayEthereumStakingCohortCapture({receipt,rawFiles}={}){
  object(receipt,'capture receipt');
  if(receipt.schemaVersion!==1||receipt.kind!=='ethereum-fixed-staking-cohort-capture'||receipt.status!=='partial-cohort-state-captured'||receipt.error)
    throw new Error('Replay needs a complete successful cohort capture');
  if(receipt.publishedAt!==null||receipt.definitionMatchedModelMetricCount!==0||receipt.eligibleModelSnapshotCount!==0||receipt.fullModelSnapshotReady!==false||receipt.modelInputActivated!==false)
    throw new Error('Capture receipt may not promote the partial cohort to economic readiness');
  if(!isDeepStrictEqual(receipt.policy,ETH_STAKING_COHORT_POLICY))throw new Error('Capture receipt does not match the exact fixed cohort policy');
  const limits=validateEthereumStakingCohortTransport(receipt.transportPolicy);
  if(!Array.isArray(rawFiles)||rawFiles.length!==3||!Array.isArray(receipt.rawFiles)||receipt.rawFiles.length!==3||!Array.isArray(receipt.requests)||receipt.requests.length!==3)
    throw new Error('Replay requires exactly three retained raw files and requests');
  if(!isDeepStrictEqual(receipt.requests.map(request=>request.kind),['genesis','header','validators']))throw new Error('Replay request sequence differs from the fixed collector');
  const files=new Map(),manifest=new Map(),requests=new Map(),input={captureStartedAt:receipt.captureStartedAt,finishedAt:receipt.observation?.finishedAt};
  for(const file of rawFiles){if(files.has(file.path))throw new Error('Duplicate replay raw path');files.set(file.path,file);}
  for(const file of receipt.rawFiles){if(manifest.has(file.path))throw new Error('Duplicate receipt raw path');manifest.set(file.path,file);}
  for(const request of receipt.requests){if(requests.has(request.kind))throw new Error('Duplicate receipt request kind');requests.set(request.kind,request);}
  const captureStart=clock(receipt.captureStartedAt,'captureStartedAt'),receiptEnd=clock(receipt.finishedAt,'receipt finishedAt'),observationEnd=clock(input.finishedAt,'observation finishedAt');
  if(observationEnd<captureStart||observationEnd>receiptEnd)throw new Error('Observation finishes outside its capture receipt chronology');
  const network=object(receipt.network,'capture network'),deadline=clock(network.deadlineAt,'network deadlineAt');
  if(deadline!==captureStart+limits.totalTimeoutMs)throw new Error('Network deadline differs from capture start plus the total timeout budget');
  let retainedBytes=0,previousRequestEnd=captureStart,lastCollectedAt=null;
  for(const kind of ['genesis','header','validators']){
    const path=kind+'.raw.json',file=files.get(path),meta=manifest.get(path),request=requests.get(kind);
    if(!file||!meta||!request||!(file.bytes instanceof Uint8Array))throw new Error('Missing required raw body or request');
    const hash=digest(file.bytes),length=file.bytes.length;retainedBytes+=length;
    if(length>limits.maximumResponseBytes||retainedBytes>limits.maximumTotalBytes)throw new Error('Raw replay body exceeds the declared response/capture byte budget');
    if(meta.sha256!==hash||meta.bytes!==length||meta.complete!==true||meta.truncated!==false||request.path!==path||request.sha256!==hash||request.receivedBytes!==length||request.retainedBytes!==length||request.complete!==true||request.truncated!==false||request.error||request.method!=='GET'||request.publishedAt!==null)
      throw new Error('Raw replay bytes, manifest or request metadata mismatch');
    const requestStart=clock(request.startedAt,'request startedAt'),collectedAt=clock(request.collectedAt,'request collectedAt'),requestEnd=clock(request.finishedAt,'request finishedAt');
    if(requestStart<previousRequestEnd||collectedAt<requestStart||requestEnd<collectedAt||requestEnd>observationEnd)throw new Error('Invalid replay request chronology or sequence');
    const requestDeadline=Math.min(requestStart+limits.requestTimeoutMs,deadline);
    if(clock(request.deadlineAt,'request deadlineAt')!==requestDeadline)throw new Error('Request deadline differs from its declared timeout budget');
    if(collectedAt>=requestDeadline)throw new Error('Successful body collection exceeds its request/total timeout budget');
    previousRequestEnd=requestEnd;lastCollectedAt=collectedAt;
    input[kind]={url:request.url,httpStatus:request.httpStatus,complete:request.complete,startedAt:request.startedAt,collectedAt:request.collectedAt,bytes:file.bytes};
  }
  if(network.requests!==receipt.requests.length||network.requests>limits.maximumRequests||network.totalReceivedBytes!==retainedBytes||network.retainedRawBytes!==retainedBytes||network.retries!==limits.retries)
    throw new Error('Capture network accounting does not match the retained raw bodies');
  // The EOF clock is budgeted. Later hash/JSON/SSZ processing and replay are not
  // network activity and may finish after the network deadline.
  if(clock(network.completedAt,'network completedAt')!==lastCollectedAt)throw new Error('Network completion does not match the final body collection');
  const observation=inspectEthereumStakingCohort(input);
  if(JSON.stringify(observation)!==JSON.stringify(receipt.observation))throw new Error('Recomputed cohort observation differs from the stored observation');
  return {schemaVersion:1,kind:'ethereum-fixed-staking-cohort-replay',status:'raw-replay-matched',networkRequestsDuringReplay:0,
    rawFileCount:3,retainedRawBytes:retainedBytes,observation,publishedAt:null,eligibleModelSnapshotCount:0,fullModelSnapshotReady:false,modelInputActivated:false,
    limitation:'Receipt and raw-byte consistency only; provider state membership, independent finality, historical publication and economic completeness remain unproven.'};
}
