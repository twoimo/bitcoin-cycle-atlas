// Geometry of a preserved provider grid; no price, supply-flow, or chain proof.
import {ETH_ECONOMIC_MAINNET_CLOCK as CLOCK} from '../dist/ethereum-economic-model.js';

export const ETH_SUPPLY_RESOLUTION_POLICY=Object.freeze({
  version:'eth-supply-resolution-1',windowDays:28,maximumRows:250000,
  maximumIntegerDigits:80,maximumProviderClockLeadSeconds:300,
  scope:'Conditionally test observed bucket/label residues against exact UTC boundary slots. A finite sample does not prove future API resolution.',
});
const DAY=86400,G=CLOCK.genesisTime,S=CLOCK.secondsPerSlot,E=CLOCK.slotsPerEpoch;
const ranges=new Set(['live','24h','7d','30d','retained']);
const check=(ok,message)=>{if(!ok)throw new RangeError(message);};
const safe=(value,label)=>{check(Number.isSafeInteger(value)&&value>=0,label+' must be a nonnegative safe integer');return value;};
const gcd=(a,b)=>{while(b){const next=a%b;a=b;b=next;}return a;};
const residues=(rows,key,modulus)=>[...new Set(rows.map(row=>row[key]%modulus))].sort((a,b)=>a-b);
export function supplyResolutionTimestamp(value,label='timestamp'){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),label+' requires an explicit UTC timestamp');
  const time=Date.parse(value);check(Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===value.slice(0,19),'Invalid '+label);return time/1000;
}
function utcDay(value){
  check(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'observedThrough requires a UTC day');
  const time=Date.parse(value+'T00:00:00Z')/1000;
  check(Number.isFinite(time)&&new Date(time*1000).toISOString().slice(0,10)===value,'Invalid observedThrough');return time;
}
function supply(value){
  if(value===undefined||value===null)return null;
  check(typeof value==='string'&&value.length<=ETH_SUPPLY_RESOLUTION_POLICY.maximumIntegerDigits&&/^(?:0|[1-9]\d*)$/.test(value),'Supply must retain a canonical exact integer string or null');
  return value;
}

export function analyzeEthereumSupplyResolution(payload,{collectedAt,observedThrough}={}){
  const collected=supplyResolutionTimestamp(collectedAt,'collectedAt'),end=utcDay(observedThrough)+DAY;
  const start=end-ETH_SUPPLY_RESOLUTION_POLICY.windowDays*DAY;
  check(end<=collected,'Requested UTC window is not yet complete at collection');
  check(start>=G,'Requested UTC window predates the mainnet slot clock');
  check(payload&&typeof payload==='object'&&!Array.isArray(payload)&&payload.schemaVersion===1,'Expected a complete supply history document');
  check(ranges.has(payload.range),'Unknown documented history range');
  check(payload.chainId===undefined||payload.chainId===1,'Unexpected source chain');
  check(payload.partial!==true&&payload.recoveryRequired!==true&&!Object.hasOwn(payload,'baseRevision')&&
    !Object.keys(payload).some(key=>key.startsWith('dropBefore')),'Incremental or recovery history is not a complete standalone document');
  safe(payload.revision,'revision');const generated=safe(payload.generatedAt,'generatedAt');
  for(const key of ['intervalSlots','intervalEpochs'])if(payload[key]!==undefined)check(safe(payload[key],key)>0,key+' must be positive');
  check(generated<=collected+ETH_SUPPLY_RESOLUTION_POLICY.maximumProviderClockLeadSeconds,'Provider generation clock exceeds bounded tolerance');
  check(Array.isArray(payload.slots)&&payload.slots.length>0&&payload.slots.length<=ETH_SUPPLY_RESOLUTION_POLICY.maximumRows,'Missing or oversized source slot rows');
  const parsed=[];let previous=null,gapSlots=0;
  for(let index=0;index<payload.slots.length;index++){
    const row=payload.slots[index];check(row&&typeof row==='object'&&!Array.isArray(row),'Invalid source row');
    const label=safe(row.slot,'slot'),timestamp=safe(row.timestamp,'timestamp');
    const explicit=row.fromSlot!==undefined||row.toSlot!==undefined;
    const first=explicit?safe(row.fromSlot,'fromSlot'):label,last=explicit?safe(row.toSlot,'toSlot'):label;
    check(first<=last&&label>=first&&label<=last,'Source label is outside its slot range');
    check(timestamp===G+label*S,'Label timestamp differs from mainnet slot clock');
    if(row.epoch!==undefined)check(safe(row.epoch,'epoch')===Math.floor(label/E),'Label epoch differs from its slot');
    const fromTimestamp=G+first*S,toTimestamp=G+last*S;
    if(row.fromTimestamp!==undefined)check(row.fromTimestamp===fromTimestamp,'Bucket start timestamp differs from its slot');
    if(row.toTimestamp!==undefined)check(row.toTimestamp===toTimestamp,'Bucket end timestamp differs from its slot');
    check(Number.isSafeInteger(fromTimestamp)&&Number.isSafeInteger(toTimestamp),'Source clock is outside safe integer range');
    check(toTimestamp<=generated+ETH_SUPPLY_RESOLUTION_POLICY.maximumProviderClockLeadSeconds,'Row coverage exceeds provider generation clock');
    check(toTimestamp<=collected,'Row coverage exceeds actual collection');
    check(row.finalized===undefined||typeof row.finalized==='boolean','Malformed explicit finality');
    check(!previous||first>previous.last&&label>previous.label,'Source rows overlap or are not ascending');
    if(previous)gapSlots+=first-previous.last-1;
    const entry={index,first,last,label,width:last-first+1,labelOffset:label-first,supplyWei:supply(row.supplyWei),finalized:row.finalized===true};
    parsed.push(entry);previous=entry;
  }
  const widths=[...new Set(parsed.map(row=>row.width))].sort((a,b)=>a-b);
  const stride=widths.length===1?widths[0]:null;
  const startResidues=stride===null?null:residues(parsed,'first',stride);
  const labelResidues=stride===null?null:residues(parsed,'label',stride);
  const uniform=parsed.length>=2&&stride!==null&&startResidues.length===1&&labelResidues.length===1;
  const firstRequiredSlot=Math.ceil((start-G)/S),lastRequiredSlot=Math.ceil((end-G)/S)-1;
  const slotsPerDay=DAY/S;check(Number.isSafeInteger(slotsPerDay),'UTC day does not contain an integer number of slots');
  const divisor=uniform?gcd(stride,slotsPerDay):null;
  const byLabel=new Map(parsed.map(row=>[row.label,row]));
  function boundary(slot){
    const row=byLabel.get(slot),matching=uniform?slot%stride===labelResidues[0]:null;
    // a + n*d = b (mod m) is solvable iff gcd(d,m) divides b-a.
    const anyUtcDay=uniform?(slot-labelResidues[0])%divisor===0:null;
    return {slot,timestamp:G+slot*S,epochResidue:slot%E,
      rowPresent:row!==undefined,supplyWei:row?.supplyWei??null,stockAvailable:row?.supplyWei!==null&&row?.supplyWei!==undefined,
      explicitlyFinalized:row?.finalized??false,
      sameObservedGridCouldLabelThisSlot:matching,
      anyDailyUtcBoundaryCouldAlignIfGridPersists:anyUtcDay};
  }
  const startBoundary=boundary(firstRequiredSlot-1),endBoundary=boundary(lastRequiredSlot);
  const incompatible=uniform&&(!startBoundary.anyDailyUtcBoundaryCouldAlignIfGridPersists||!endBoundary.anyDailyUtcBoundaryCouldAlignIfGridPersists);
  const rowsInside=parsed.filter(row=>row.first>=firstRequiredSlot&&row.last<=lastRequiredSlot);
  const intersecting=parsed.filter(row=>row.first<=lastRequiredSlot&&row.last>=firstRequiredSlot);
  const covered=intersecting.reduce((total,row)=>total+Math.min(lastRequiredSlot,row.last)-Math.max(firstRequiredSlot,row.first)+1,0);
  const requestedSlots=lastRequiredSlot-firstRequiredSlot+1;
  const crossing=intersecting.filter(row=>row.first<firstRequiredSlot||row.last>lastRequiredSlot).length;
  return {version:ETH_SUPPLY_RESOLUTION_POLICY.version,kind:'ethereum-supply-resolution-diagnostic',
    provider:{range:payload.range,revision:payload.revision,generatedAt:new Date(generated*1000).toISOString(),
      interval:payload.interval??null,declaredIntervalSlots:payload.intervalSlots??null,declaredIntervalEpochs:payload.intervalEpochs??null},
    collectedAt,publishedAt:null,providerClockAfterCollection:generated>collected,
    requestedWindow:{observedFrom:new Date(start*1000).toISOString().slice(0,10),observedThrough,windowDays:28,
      firstRequiredSlot,lastRequiredSlot,requiredSlots:requestedSlots,startBoundary,endBoundary,
      intersectingRows:intersecting.length,boundaryCrossingRows:crossing,coveredSlots:covered,
      exactWholeRowFlowCoverage:covered===requestedSlots&&crossing===0,
      whollyInsideRows:rowsInside.length},
    observedGrid:{rows:parsed.length,widthsSlots:widths,uniformAlignedGridObserved:uniform,
      strideSlots:uniform?stride:null,startResidue:uniform?startResidues[0]:null,labelResidue:uniform?labelResidues[0]:null,
      allLabelsAtBucketEnd:parsed.every(row=>row.label===row.last),allRowsExplicitlyFinalized:parsed.every(row=>row.finalized),
      missingSlotsBetweenRows:gapSlots,
      epochResidues:{starts:residues(parsed,'first',E),ends:residues(parsed,'last',E),labels:residues(parsed,'label',E)},
      declaredSlotWidthMatchesEveryRow:payload.intervalSlots==null?null:parsed.every(row=>row.width===payload.intervalSlots)},
    utcAlignment:{slotsPerDay,slotsPerEpoch:E,epochsPerDay:slotsPerDay/E,dailyAdvanceModuloEpoch:slotsPerDay%E,
      gcdGridAndDailyAdvance:divisor,conditionalIncompatibilityProven:incompatible,
      status:!uniform?'regular-grid-not-established':incompatible?'same-grid-cannot-label-utc-boundary':'same-grid-does-not-rule-out-utc-boundary',
      condition:'Every future relevant stock label must retain this observed stride and label residue. Changing API resolution or grid origin invalidates this conditional conclusion.',
      finiteSamplesProveFutureApiGrid:false,
      mathematicalCriterion:'An observed label residue b modulo m can meet the UTC boundary sequence a+n*d iff gcd(m,d) divides a-b.'},
    modelInputActivated:false,fullModelSnapshotReady:false,eligibleModelSnapshotCount:0,
    independentCanonicalValidation:false,historicalPublicationAuthenticated:false,
    limitations:['This diagnostic checks slot geometry, clocks and supplied stock labels; it does not reconcile supply-changing flows.',
      'A compatible grid does not establish available historical rows, exact accounting semantics, future service behavior or independent canonical state.',
      'Missing stocks remain null. No proration, timestamp relabeling, or missing-zero fill is performed.']};
}
