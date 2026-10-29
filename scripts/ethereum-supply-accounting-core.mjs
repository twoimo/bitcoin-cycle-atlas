// Exact arithmetic over a provider's preserved claims. This is not chain execution,
// a UTC-window source adapter, or evidence of historical publication.
import { ETH_ECONOMIC_INPUT_SCHEMA, ETH_ECONOMIC_MAINNET_CLOCK } from '../dist/ethereum-economic-model.js';

export const ETH_SUPPLY_ACCOUNTING_SOURCE=Object.freeze({
  historyUrl:'https://ethsupply.fyi/api/history?range=30d',
  methodologyUrl:'https://ethsupply.fyi/methodology/',
  protocolFile:'research-data/eth-supply-accounting/eip-6780.md',
  protocolUrl:'https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-6780.md',
  protocolGitBlobSha:'1b6a0e94cc47e859b9866e570391cf37dc55059a',
  attribution:'ethsupply.fyi / donnoh.gwei; protocol specification: Ethereum EIPs, CC0',
  redistributionLicense:'Provider data license not established by this audit; retain attribution and source URL.',
});
export const ETH_SUPPLY_ACCOUNTING_POLICY=Object.freeze({
  version:'eth-supply-accounting-audit-3',maximumRows:250000,maximumIntegerDigits:80,
  requestCount:2,retries:0,historyMaximumBytes:8*1024*1024,methodologyMaximumBytes:2*1024*1024,
  formula:'netWei = issuanceWei - baseFeeBurnWei - blobBaseFeeBurnWei - consensusPenaltiesWei - otherExecutionBurnWei',
  missingPolicy:'Unknown otherExecutionBurnWei is missing, not zero; a residual is not automatically classified destruction.',
});
const COMPONENTS=['baseFeeBurnWei','blobBaseFeeBurnWei','consensusPenaltiesWei','otherExecutionBurnWei'];
const MONEY_FIELDS=['supplyWei','issuanceWei','attestationIssuanceWei','syncCommitteeIssuanceWei','proposerIssuanceWei',
  'attestationSourceIssuanceWei','attestationTargetIssuanceWei','attestationHeadIssuanceWei','attestationInclusionIssuanceWei',
  'syncInclusionIssuanceWei','proposerSlashingIssuanceWei','attesterSlashingIssuanceWei','otherProposerIssuanceWei',
  'burnWei',...COMPONENTS,'attestationSourcePenaltyWei','attestationTargetPenaltyWei','inactivityPenaltyWei',
  'syncCommitteePenaltyWei','initialSlashingPenaltyWei','correlationSlashingPenaltyWei',
  'offsetBaseFeeWei','averageBaseFeePerGasWei','baseFeePerGasWei','gasUsed','gasTarget','gasMax',
  'blobFloorBurnWei','blobCongestionBurnWei'];
const SIGNED_FIELDS=['netWei'];
const USAGE_PRESENTATION=['blobsUsed','blobsTarget','blobsMax'];
const DAY=86400,GENESIS=ETH_ECONOMIC_MAINNET_CLOCK.genesisTime,SLOT=ETH_ECONOMIC_MAINNET_CLOCK.secondsPerSlot;
const check=(ok,message)=>{if(!ok)throw new RangeError(message);};
function safe(value,label){check(Number.isSafeInteger(value)&&value>=0,label+' must be a nonnegative safe integer');return value;}
function stamp(value,label){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),label+' requires an explicit UTC timestamp');
  const t=Date.parse(value);check(Number.isFinite(t)&&new Date(t).toISOString().slice(0,19)===value.slice(0,19),'Invalid '+label);return t/1000;
}
function date(value){check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'observedThrough requires a UTC day');
  const t=Date.parse(value+'T00:00:00Z')/1000;check(Number.isFinite(t)&&new Date(t*1000).toISOString().slice(0,10)===value,'Invalid UTC day');return t;}
function integer(value,label,signed=false){
  if(value===null||value===undefined)return null;
  check(typeof value==='string'&&value.length<=ETH_SUPPLY_ACCOUNTING_POLICY.maximumIntegerDigits&&
    (signed?/^(?:0|-?[1-9]\d*)$/:/^(?:0|[1-9]\d*)$/).test(value),label+' must retain a canonical exact integer string or null');
  return BigInt(value);
}
function rowValues(row,label){
  check(row&&typeof row==='object'&&!Array.isArray(row),label+' must be an object');
  const values={};for(const f of MONEY_FIELDS)values[f]=integer(row[f],label+'.'+f);
  for(const f of SIGNED_FIELDS)values[f]=integer(row[f],label+'.'+f,true);
  // The captured 30epochs document reports fractional blobsUsed even though its
  // public schema calls this UInt. Keep ancillary presentation numbers; do not
  // turn an average/rate-like field into an integer count or additive usage.
  for(const f of USAGE_PRESENTATION)if(row[f]!=null)check(typeof row[f]==='number'&&Number.isFinite(row[f])&&row[f]>=0,label+'.'+f+' must be a finite nonnegative presentation number or null');
  if(row.blocks!=null)safe(row.blocks,label+'.blocks');
  return values;
}
function arithmetic(values){
  const complete=COMPONENTS.every(f=>values[f]!==null),componentTotal=complete?COMPONENTS.reduce((s,f)=>s+values[f],0n):null;
  const expectedNet=componentTotal!==null&&values.issuanceWei!==null?values.issuanceWei-componentTotal:null;
  const feeBurn=values.baseFeeBurnWei!==null&&values.blobBaseFeeBurnWei!==null?values.baseFeeBurnWei+values.blobBaseFeeBurnWei:null;
  const feeAndOther=feeBurn!==null&&values.otherExecutionBurnWei!==null?feeBurn+values.otherExecutionBurnWei:null;
  return {
    componentTotalWei:componentTotal?.toString()??null,
    feeBurnComponentTotalWei:feeBurn?.toString()??null,
    // These are explicit alternative interpretations of reported burnWei.
    // The actual first source has otherExecutionBurnWei=0 in every row, so
    // agreement cannot distinguish fee-only from fee-plus-other semantics.
    burnResidualWei:feeBurn!==null&&values.burnWei!==null?(values.burnWei-feeBurn).toString():null,
    feePlusOtherBurnResidualWei:feeAndOther!==null&&values.burnWei!==null?(values.burnWei-feeAndOther).toString():null,
    allDestructionResidualWei:componentTotal!==null&&values.burnWei!==null?(values.burnWei-componentTotal).toString():null,
    expectedNetWei:expectedNet?.toString()??null,
    netResidualWei:expectedNet!==null&&values.netWei!==null?(values.netWei-expectedNet).toString():null,
    netVersusReportedBurnResidualWei:values.issuanceWei!==null&&values.burnWei!==null&&values.netWei!==null&&values.consensusPenaltiesWei!==null&&values.otherExecutionBurnWei!==null?
      (values.netWei-(values.issuanceWei-values.burnWei-values.consensusPenaltiesWei-values.otherExecutionBurnWei)).toString():null,
    omittedOtherBurnBiasWei:complete?values.otherExecutionBurnWei.toString():null,
  };
}
function slotRange(row){
  if(row.fromSlot!==undefined||row.toSlot!==undefined){
    const first=safe(row.fromSlot,'fromSlot'),last=safe(row.toSlot,'toSlot');check(first<=last,'Reversed source slot bucket');
    const position=safe(row.slot,'slot');check(position>=first&&position<=last&&row.timestamp===GENESIS+position*SLOT,'Bucket label is outside its slot range or mainnet clock');
    if(row.fromTimestamp!=null)check(row.fromTimestamp===GENESIS+first*SLOT,'Source bucket start clock differs from its slot');
    if(row.toTimestamp!=null)check(row.toTimestamp===GENESIS+last*SLOT,'Source bucket end clock differs from its slot');
    return {first,last,explicit:true};
  }
  const s=safe(row.slot,'slot');check(row.timestamp===GENESIS+s*SLOT,'Slot timestamp differs from the mainnet slot clock');
  return {first:s,last:s,explicit:false};
}
function summarizeSeries(rows,kind){
  check(Array.isArray(rows)&&rows.length<=ETH_SUPPLY_ACCOUNTING_POLICY.maximumRows,'Missing or oversized '+kind+' array');
  const fields=Object.fromEntries([...MONEY_FIELDS,...SIGNED_FIELDS].map(f=>[f,{present:0,missing:0}]));
  const counters={burnComponentsChecked:0,burnComponentsMismatched:0,netComponentsChecked:0,netComponentsMismatched:0,
    netVersusReportedBurnChecked:0,netVersusReportedBurnMismatched:0,otherBurnPresent:0,otherBurnMissing:0,otherBurnNonzero:0};
  const reportedBurnCandidates=Object.fromEntries(['feeOnly','feePlusOtherExecution','allDestruction'].map(k=>[k,{checked:0,mismatched:0}]));
  const usagePresentation=Object.fromEntries(USAGE_PRESENTATION.map(f=>[f,{present:0,missing:0,nonInteger:0,minimum:null,maximum:null,additiveTotalEligible:false}]));
  const examples=[],parsed=[],pairExamples=[];let previous=null,firstRow=null,firstPair=null,lastPair=null,pairCount=0,pairMismatchCount=0,allContiguous=true;
  const totals=Object.fromEntries(['issuanceWei','burnWei',...COMPONENTS,'netWei'].map(f=>[f,0n]));
  const laterTotals={...totals};
  for(let index=0;index<rows.length;index++){
    const row=rows[index],label=kind+'['+index+']',v=rowValues(row,label),t=safe(row.timestamp,label+'.timestamp');
    const position=safe(row[kind==='slots'?'slot':'epoch'],label+'.position');
    check(!previous||t>previous.timestamp&&position>previous.position,kind+' positions and timestamps must be unique and ascending');
    const range=kind==='slots'?slotRange(row):null;
    if(range&&previous)check(range.first>previous.range.last,'Overlapping source slot buckets');
    for(const f of Object.keys(fields))fields[f][v[f]===null?'missing':'present']++;
    for(const f of USAGE_PRESENTATION){const u=usagePresentation[f],value=row[f];if(value==null)u.missing++;
      else{u.present++;if(!Number.isInteger(value))u.nonInteger++;u.minimum=u.minimum===null?value:Math.min(u.minimum,value);u.maximum=u.maximum===null?value:Math.max(u.maximum,value);}}
    const a=arithmetic(v);
    for(const [name,key]of [['feeOnly','burnResidualWei'],['feePlusOtherExecution','feePlusOtherBurnResidualWei'],['allDestruction','allDestructionResidualWei']]){
      if(a[key]!==null){reportedBurnCandidates[name].checked++;if(a[key]!=='0')reportedBurnCandidates[name].mismatched++;}}
    for(const f of Object.keys(totals)){
      totals[f]=totals[f]!==null&&v[f]!==null?totals[f]+v[f]:null;
      if(index>0)laterTotals[f]=laterTotals[f]!==null&&v[f]!==null?laterTotals[f]+v[f]:null;
    }
    for(const [key,base]of [['burnResidualWei','burnComponents'],['netResidualWei','netComponents'],['netVersusReportedBurnResidualWei','netVersusReportedBurn']]){
      if(a[key]!==null){counters[base+'Checked']++;if(a[key]!=='0'){counters[base+'Mismatched']++;if(examples.length<20)examples.push({index,position,identity:key,residualWei:a[key]});}}
    }
    counters[v.otherExecutionBurnWei===null?'otherBurnMissing':'otherBurnPresent']++;
    if(v.otherExecutionBurnWei!==null&&v.otherExecutionBurnWei>0n)counters.otherBurnNonzero++;
    // This comparison states its endpoint convention explicitly. It is not used
    // to promote the provider's epoch/duty accounting into a UTC-day observation.
    const contiguous=previous&&(kind==='slots'?range.first===previous.range.last+1:position===previous.position+1&&t-previous.timestamp===SLOT*ETH_ECONOMIC_MAINNET_CLOCK.slotsPerEpoch);
    if(previous&&!contiguous)allContiguous=false;
    if(contiguous&&v.supplyWei!==null&&previous.values.supplyWei!==null&&v.netWei!==null){
      const delta=v.supplyWei-previous.values.supplyWei;
      const pair={fromPosition:previous.position,toPosition:position,supplyChangeWei:delta.toString(),reportedNetWei:v.netWei.toString(),residualWei:(delta-v.netWei).toString()};
      pairCount++;firstPair??=pair;lastPair=pair;if(pair.residualWei!=='0'){pairMismatchCount++;if(pairExamples.length<20)pairExamples.push(pair);}
    }
    // A grouped row may carry a label inside its range. The entire inclusive
    // fromSlot..toSlot claim is observed only after its last slot, not its label.
    const coverageEndTimestamp=range?GENESIS+range.last*SLOT:t;
    previous={index,position,timestamp:t,coverageEndTimestamp,range,values:v};firstRow??=previous;parsed.push({...previous,row});
  }
  let endpointDecomposition=null;
  if(rows.length>=2&&allContiguous&&firstRow.values.supplyWei!==null&&previous.values.supplyWei!==null){
    const delta=previous.values.supplyWei-firstRow.values.supplyWei,a=arithmetic(laterTotals);
    endpointDecomposition={fromPosition:firstRow.position,toPosition:previous.position,startSupplyWei:firstRow.values.supplyWei.toString(),endSupplyWei:previous.values.supplyWei.toString(),
      supplyChangeWei:delta.toString(),flowRowsIncluded:rows.length-1,firstRowFlowExcluded:true,
      componentClaims:Object.fromEntries(Object.entries(laterTotals).map(([f,v])=>[f,v?.toString()??null])),
      expectedChangeFromComponentsWei:a.expectedNetWei,
      componentResidualWei:a.expectedNetWei===null?null:(delta-BigInt(a.expectedNetWei)).toString(),
      reportedNetResidualWei:laterTotals.netWei===null?null:(delta-laterTotals.netWei).toString(),
      biasIfOtherExecutionBurnOmittedWei:a.omittedOtherBurnBiasWei};
  }
  return {summary:{rows:rows.length,firstTimestamp:rows[0]?.timestamp??null,lastTimestamp:rows.at(-1)?.timestamp??null,
    lastCoveredTimestamp:parsed.at(-1)?.coverageEndTimestamp??null,
    fields,...counters,mismatchExamples:examples,reportedBurnCandidates,usagePresentation,
    excludedFromAdditiveTotals:['gasUsed','gasTarget','gasMax',...USAGE_PRESENTATION],
    usageMeaning:'Grouped source fields have unestablished aggregate/average semantics. Fractional blob presentation is retained; gas and blob presentation values are never summed or converted into model usage.',
    reportedRowSums:Object.fromEntries(Object.entries(totals).map(([f,v])=>[f,rows.length?v?.toString()??null:null])),
    endpointArithmetic:{convention:'Treat supplyWei as the end of each reported contiguous bucket and compare the later row netWei. This convention check does not establish source clock semantics.',
      adjacentPairsChecked:pairCount,mismatchedPairs:pairMismatchCount,firstPair,lastPair,mismatchExamples:pairExamples,endpointDecomposition}},parsed};
}
function reconcileUtcWindowStocks(parsed,intersecting,first,last,exactBuckets,aggregates){
  const start=parsed.find(p=>p.range.last===first-1)??null;
  const end=intersecting.at(-1)?.range.last===last?intersecting.at(-1):null;
  // A stock at a label inside a grouped range is not necessarily the stock at
  // the range end. Keep that ambiguity unavailable instead of moving the stock.
  const startAtBoundary=start!==null&&start.position===first-1;
  const endAtBoundary=end!==null&&end.position===last;
  const startSupply=startAtBoundary?start.values.supplyWei:null;
  const endSupply=endAtBoundary?end.values.supplyWei:null;
  const unavailableReasons=[];
  if(!exactBuckets)unavailableReasons.push('exact-window-flow-coverage-unavailable');
  if(!start)unavailableReasons.push('preceding-boundary-stock-row-unavailable');
  else if(!startAtBoundary)unavailableReasons.push('preceding-stock-label-is-not-boundary-slot');
  else if(startSupply===null)unavailableReasons.push('preceding-boundary-supply-missing');
  if(!end)unavailableReasons.push('ending-boundary-stock-row-unavailable');
  else if(!endAtBoundary)unavailableReasons.push('ending-stock-label-is-not-boundary-slot');
  else if(endSupply===null)unavailableReasons.push('ending-boundary-supply-missing');
  const componentFields=['issuanceWei',...COMPONENTS];
  const missingFlowComponents=exactBuckets?componentFields.filter(f=>aggregates[f]===null):componentFields;
  if(exactBuckets&&missingFlowComponents.length)unavailableReasons.push('window-supply-components-missing');
  if(exactBuckets&&aggregates.netWei===null)unavailableReasons.push('window-reported-net-missing');
  const delta=startSupply!==null&&endSupply!==null?endSupply-startSupply:null;
  const expected=exactBuckets&&missingFlowComponents.length===0?
    BigInt(aggregates.issuanceWei)-COMPONENTS.reduce((sum,f)=>sum+BigInt(aggregates[f]),0n):null;
  const reported=exactBuckets&&aggregates.netWei!==null?BigInt(aggregates.netWei):null;
  const componentResidual=delta!==null&&expected!==null?delta-expected:null;
  const reportedResidual=delta!==null&&reported!==null?delta-reported:null;
  const mismatched=[componentResidual,reportedResidual].some(v=>v!==null&&v!==0n);
  const complete=componentResidual!==null&&reportedResidual!==null;
  return {
    status:mismatched?'provider-claims-mismatch':complete?'provider-claims-match':'unavailable',
    convention:'Conditionally treat supplyWei at the row label as the end-of-slot stock; require labels at the preceding and final requested slots. Include every exact-window flow row, exclude the predecessor flow.',
    startBoundarySlot:first-1,endBoundarySlot:last,
    startBoundaryTimestamp:GENESIS+(first-1)*SLOT,endBoundaryTimestamp:GENESIS+last*SLOT,
    startRowPosition:start?.position??null,endRowPosition:end?.position??null,
    startSupplyWei:startSupply?.toString()??null,endSupplyWei:endSupply?.toString()??null,
    startBoundaryExplicitlyFinalized:startAtBoundary&&start.row.finalized===true,
    endBoundaryExplicitlyFinalized:endAtBoundary&&end.row.finalized===true,
    flowRowsIncluded:exactBuckets?intersecting.length:0,predecessorFlowExcluded:true,
    supplyChangeWei:delta?.toString()??null,expectedChangeFromComponentsWei:expected?.toString()??null,
    reportedNetWei:reported?.toString()??null,componentResidualWei:componentResidual?.toString()??null,
    reportedNetResidualWei:reportedResidual?.toString()??null,missingFlowComponents,unavailableReasons,
    independentCanonicalValidation:false,utcAccountingEligibilityProven:false,
  };
}
function inspectUtcWindow(parsed,observedThrough){
  const end=date(observedThrough)+DAY,start=end-28*DAY,first=Math.ceil((start-GENESIS)/SLOT),last=Math.ceil((end-GENESIS)/SLOT)-1;
  const intersecting=parsed.filter(p=>p.range.first<=last&&p.range.last>=first);
  const boundaryCrossing=intersecting.filter(p=>p.range.first<first||p.range.last>last);
  let covered=0,previous=null,gaps=0;for(const p of intersecting){
    const low=Math.max(first,p.range.first),high=Math.min(last,p.range.last);covered+=high-low+1;
    if(previous!==null&&low!==previous+1)gaps++;previous=high;
  }
  const covers=intersecting.length>0&&intersecting[0].range.first<=first&&intersecting.at(-1).range.last>=last&&gaps===0&&covered===last-first+1;
  const missingComponents=Object.fromEntries(['issuanceWei','burnWei',...COMPONENTS,'netWei','gasUsed','supplyWei'].map(f=>[f,intersecting.filter(p=>p.values[f]===null).length]));
  const finalized=intersecting.length>0&&intersecting.every(p=>p.row.finalized===true);
  const exactBuckets=covers&&boundaryCrossing.length===0;
  const aggregates={};if(exactBuckets)for(const f of ['issuanceWei','burnWei',...COMPONENTS,'netWei']){
    aggregates[f]=missingComponents[f]===0?intersecting.reduce((s,p)=>s+p.values[f],0n).toString():null;
  }
  const stockFlowReconciliation=reconcileUtcWindowStocks(parsed,intersecting,first,last,exactBuckets,aggregates);
  return {observedFrom:new Date(start*1000).toISOString().slice(0,10),observedThrough,windowDays:28,
    utcIntervalConvention:'[observedFrom 00:00:00 UTC, day after observedThrough 00:00:00 UTC)',
    firstRequiredSlot:first,lastRequiredSlot:last,requiredSlots:last-first+1,coveredSlots:covered,intersectingBuckets:intersecting.length,
    firstRequiredTimestamp:GENESIS+first*SLOT,lastRequiredTimestamp:GENESIS+last*SLOT,
    boundaryCrossingBuckets:boundaryCrossing.length,internalGapCount:gaps,providerBucketsCoverAllRequiredSlots:covers,
    exactBucketBoundaryMatch:exactBuckets,allSelectedBucketsExplicitlyFinalized:finalized,missingComponents,
    providerClaimAggregates:aggregates,stockFlowReconciliation,utcAccountingEligibilityProven:false,
    excludedUsageFields:['gasUsed','gasTarget','gasMax',...USAGE_PRESENTATION],
    blockingReasons:[...(!covers?['incomplete-slot-coverage']:[]),...(boundaryCrossing.length?['source-bucket-straddles-utc-window']:[]),
      ...(!finalized?['finality-not-explicit-for-every-selected-bucket']:[]),
      ...(stockFlowReconciliation.status==='unavailable'?['requested-window-stock-flow-reconciliation-unavailable']:[]),
      ...(stockFlowReconciliation.status==='provider-claims-mismatch'?['requested-window-stock-flow-reconciliation-mismatch']:[]),
      ...(!stockFlowReconciliation.startBoundaryExplicitlyFinalized||!stockFlowReconciliation.endBoundaryExplicitlyFinalized?['boundary-stock-finality-not-explicit']:[]),
      'provider-bucket-duty-and-recognition-semantics-not-independently-verified','publication-time-unknown','canonical-state-not-independently-replayed'],
    interpretation:'Bucket sums remain provider claims even when integer arithmetic and requested slot boundaries align. No proration, missing-zero fill, or epoch-to-UTC relabeling.',
  };
}

export function auditEthereumSupplyAccounting(payload,{collectedAt,observedThrough}={}){
  const collected=stamp(collectedAt,'collectedAt');date(observedThrough);
  check(date(observedThrough)+DAY<=collected,'Requested UTC window is not yet complete');
  check(payload&&typeof payload==='object'&&payload.schemaVersion===1,'Unexpected supply history schema');
  check(payload.range==='30d','Expected the declared 30d history document');
  check(payload.partial!==true&&payload.baseRevision===undefined,'Incremental history is not a complete standalone document');
  safe(payload.revision,'revision');const generated=safe(payload.generatedAt,'generatedAt');
  check(generated<=collected+300,'Provider generation clock exceeds bounded clock tolerance');
  if(payload.chainId!==undefined)check(payload.chainId===1,'Provider returned another chain');
  const slots=summarizeSeries(payload.slots,'slots'),epochs=summarizeSeries(payload.epochs,'epochs');
  check(slots.summary.rows+epochs.summary.rows<=ETH_SUPPLY_ACCOUNTING_POLICY.maximumRows,'Combined history exceeds row bound');
  check(slots.summary.rows+epochs.summary.rows>0,'Provider supplied no accounting rows');
  for(const series of [slots,epochs])if(series.summary.lastCoveredTimestamp!==null)check(series.summary.lastCoveredTimestamp<=generated+300,'Accounting row coverage is after provider generation');
  const summary=payload.summary?arithmetic(rowValues(payload.summary,'summary')):null;
  const observationClocks=Object.fromEntries([['slots',slots],['epochs',epochs]].map(([name,series])=>{
    const future=series.parsed.filter(p=>p.coverageEndTimestamp>collected);
    const futureLabels=series.parsed.filter(p=>p.timestamp>collected);
    return [name,{rowsAfterActualCollection:future.length,labelsAfterActualCollection:futureLabels.length,
      latestReportedTimestamp:series.summary.lastTimestamp,latestCoveredTimestamp:series.summary.lastCoveredTimestamp,
      maximumLeadSeconds:future.reduce((max,p)=>Math.max(max,p.coverageEndTimestamp-collected),0),
      maximumLabelLeadSeconds:futureLabels.reduce((max,p)=>Math.max(max,p.timestamp-collected),0)}];
  }));
  return {version:ETH_SUPPLY_ACCOUNTING_POLICY.version,status:'provider-accounting-audited',source:ETH_SUPPLY_ACCOUNTING_SOURCE,
    providerSchemaVersion:payload.schemaVersion,providerRevision:payload.revision,providerGeneratedAt:new Date(generated*1000).toISOString(),
    providerClockAfterCollection:generated>collected,collectedAt,publishedAt:null,historicalAvailabilityProven:false,
    observationClocks,
    providerInterval:payload.interval??null,intervalSlots:payload.intervalSlots??null,intervalEpochs:payload.intervalEpochs??null,
    declaredCoverage:payload.coverage??null,declaredWarnings:payload.warnings??null,summaryArithmetic:summary,
    series:{slots:slots.summary,epochs:epochs.summary},utcWindow:inspectUtcWindow(slots.parsed,observedThrough),
    supplyIdentity:ETH_SUPPLY_ACCOUNTING_POLICY.formula,
    reportedBurnInterpretation:{
      burnComponentsCheck:'Conditional burnWei = baseFeeBurnWei + blobBaseFeeBurnWei; consensus penalties are a separate deduction.',
      netVersusReportedBurnCheck:'Conditional netWei = issuanceWei - burnWei - consensusPenaltiesWei - otherExecutionBurnWei, if burnWei means fee-only burn.',
      alternativesRetained:['fee-only','fee-plus-other-execution','all-destruction'],
      ambiguity:'When otherExecutionBurnWei is zero, a matching source cannot distinguish fee-only and fee-plus-other burnWei. The independently component-computed net never depends on selecting a burnWei convention.',
      sourceSemanticProofEstablished:false},
    definitionFinding:{id:'other-execution-destruction-required',sourceUrl:ETH_SUPPLY_ACCOUNTING_SOURCE.protocolUrl,
      field:'otherExecutionBurnEth',reason:'EIP-6780 retains same-transaction SELFDESTRUCT burns. A fee-only supply identity is incomplete without measured non-fee destruction or affirmative exact-window zero evidence.',
      aProposalIsNotAnActivatedFork:true,modelDefinitionVersion:ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion},
    requiredMetricCount:Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics).length,definitionMatchedModelMetricCount:0,
    independentCanonicalValidation:false,independentProviderAudit:false,fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,
    modelInputActivated:false,modelSnapshots:[],
  };
}

