import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';

const YEAR=365.25;
export const CAPITAL_POLICIES=Object.freeze([
  {id:'cash-at-put',label:'최초 풋에서 현금 상환'},
  {id:'hold-to-maturity',label:'풋 미행사 · 만기 상환'},
  {id:'convert-at-window',label:'풋 미행사 · 적격 기간 전환'},
]);
const sourceId='mstr-10q-2026q2';
const mstrTerms=[
  ['2028',1_010_000_000,.00625,'2027-09-15','2028-09-15','2028-03-15',5_513_489],
  ['2029',1_500_000_000,0,'2028-06-01','2029-12-01','2029-06-01',2_230_800],
  ['2030A',800_000_000,.00625,'2028-09-15','2030-03-15','2029-09-15',5_341_600],
  ['2030B',2_000_000_000,0,'2028-03-01','2030-03-01','2029-12-03',4_614_400],
  ['2031',603_659_000,.00875,'2028-09-15','2031-03-15','2030-09-15',2_593_923],
  ['2032',800_000_000,.0225,'2029-06-15','2032-06-15','2031-12-15',3_915_200],
].map(([name,faceUsd,couponRate,putDate,maturityDate,convertibleFrom,conversionShares])=>Object.freeze({
  id:`mstr-notes-${name}`,label:`${name} Convertible Notes`,kind:'debt',faceUsd,couponRate,putDate,maturityDate,
  // Contractual eligibility ends before maturity by business days. This model
  // deliberately stops 30 calendar days early; it does not invent that calendar.
  conversion:{from:convertibleFrom,modelWindowEnd:dateFromDay(utcDay(maturityDate)-30),sharesPerUsd:conversionShares/faceUsd,sharesAtSnapshot:conversionShares,
    eligibility:'unconditional-window-only',settlement:'all-shares-assumption'},
  financialAsOf:'2026-06-30',publishedAt:'2026-07-30',sourceIds:[sourceId],termsStatus:'reviewed-summary',
}));
export const REVIEWED_MSTR_INSTRUMENTS=Object.freeze(mstrTerms);
const finite=(value,name)=>{if(!Number.isFinite(value)||value<0)throw new RangeError(`${name} must be finite and nonnegative`);return value;};
const same=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,a,b);

function validateTerms(item,asOf){
  if(!item||typeof item.id!=='string'||!item.id||!['debt','preferred'].includes(item.kind))throw new TypeError('Instrument identity and claim kind are required');
  finite(item.faceUsd,'Instrument face amount');
  if(item.couponRate!==null&&item.couponRate!==undefined){finite(item.couponRate,'Coupon rate');if(item.couponRate>1)throw new RangeError('Coupon rate must be a fraction');}
  for(const key of ['financialAsOf','publishedAt','putDate','maturityDate'])if(item[key])utcDay(item[key]);
  if(item.putDate&&item.maturityDate&&item.putDate>item.maturityDate)throw new RangeError('Holder put date cannot follow maturity');
  if(item.publishedAt&&item.publishedAt>asOf)throw new RangeError('Instrument terms were not available at cutoff');
  if(item.financialAsOf&&item.financialAsOf>asOf)throw new RangeError('Instrument balance is after cutoff');
  if(item.conversion){
    utcDay(item.conversion.from);
    if(item.conversion.modelWindowEnd){utcDay(item.conversion.modelWindowEnd);if(item.conversion.modelWindowEnd<item.conversion.from)throw new RangeError('Model conversion window must not end before it begins');}
    if(item.maturityDate&&(item.conversion.from>=item.maturityDate||item.conversion.modelWindowEnd>=item.maturityDate))throw new RangeError('Conversion window must precede maturity');
    if(!(finite(item.conversion.sharesPerUsd,'Conversion ratio')>0))throw new RangeError('Conversion ratio must be positive');
    if(item.conversion.eligibility!=='unconditional-window-only')throw new RangeError('Conditional early conversion requires a separate verified eligibility model');
    if(!item.sourceIds?.length||item.termsStatus!=='reviewed-summary')throw new RangeError('Conversion requires reviewed source terms');
  }
  return {...item,couponRate:item.couponRate??null,sourceIds:[...(item.sourceIds||[])],outstandingUsd:item.faceUsd,status:'outstanding'};
}

function termsFor(symbol,snapshot,asOf){
  if(Array.isArray(snapshot.instruments))return snapshot.instruments;
  const result=[];
  if(symbol==='MSTR'&&snapshot.asOf==='2026-06-30'&&snapshot.sourceIds?.includes(sourceId)&&same(snapshot.debtUsd,6_713_659_000))result.push(...mstrTerms);
  else {
    let scheduled=0;
    for(const [index,item] of (snapshot.debtSchedule||[]).entries()){
      const faceUsd=finite(item.principalUsd??item.amountUsd??0,'Scheduled principal');
      if(!faceUsd)continue;
      scheduled+=faceUsd;
      result.push({id:`scheduled-debt-${index}`,label:item.description||`채무 ${index+1}`,kind:'debt',faceUsd,couponRate:null,
        ...(item.kind==='holder-put'?{putDate:item.date}:{maturityDate:item.date}),sourceIds:item.sourceIds||snapshot.sourceIds,
        financialAsOf:snapshot.asOf,publishedAt:snapshot.publishedAt,termsStatus:'coupon-and-conversion-unresolved'});
    }
    if(scheduled>snapshot.debtUsd&&!same(scheduled,snapshot.debtUsd))throw new RangeError('Scheduled instruments exceed snapshot debt');
    if(snapshot.debtUsd>scheduled)result.push({id:'unallocated-debt',label:'조건 미확인 채무',kind:'debt',faceUsd:snapshot.debtUsd-scheduled,couponRate:null,sourceIds:snapshot.sourceIds,termsStatus:'unresolved'});
  }
  const bmnp=symbol==='BMNR'&&snapshot.asOf==='2026-05-31'&&snapshot.sourceIds?.includes('bmnr-2026-q3-10q')&&snapshot.preferredUsd>=350_000_000&&
    snapshot.modelAdjustments?.some(item=>item.date<=asOf&&item.publishedAt<=asOf&&item.sourceIds?.includes('bmnr-preferred-2026'));
  if(bmnp)result.push({id:'bmnr-bmnp-initial',label:'BMNP 최초 발행분',kind:'preferred',faceUsd:350_000_000,couponRate:.095,
    financialAsOf:'2026-06-10',publishedAt:'2026-06-15',sourceIds:['bmnr-preferred-2026','bmnr-preferred-close-2026'],termsStatus:'reviewed-summary',
    cumulative:true,conversion:null,redemption:'issuer-election-not-assumed',liquidationPreference:'initial-minimum-only'});
  const preferredRemaining=(snapshot.preferredUsd||0)-(bmnp?350_000_000:0);
  if(preferredRemaining)result.push({id:'unallocated-preferred',label:'우선주 합계 · 개별 조건 미확인',kind:'preferred',faceUsd:preferredRemaining,couponRate:null,sourceIds:snapshot.sourceIds,termsStatus:'unresolved'});
  return result;
}

export function createInstrumentLedger({symbol,snapshot,asOf,policy='cash-at-put'}={}){
  utcDay(asOf);
  if(!CAPITAL_POLICIES.some(item=>item.id===policy))throw new RangeError('Unknown capital policy');
  const instruments=termsFor(symbol,snapshot,asOf).map(item=>validateTerms(item,asOf));
  if(new Set(instruments.map(item=>item.id)).size!==instruments.length)throw new RangeError('Instrument identities must be unique');
  for(const kind of ['debt','preferred']){
    const total=instruments.filter(item=>item.kind===kind).reduce((sum,item)=>sum+item.faceUsd,0);
    if(!same(total,snapshot[`${kind}Usd`]||0))throw new RangeError(`Instrument ${kind} claims do not reconcile with snapshot`);
  }
  const initialKnownAnnualCarry=instruments.reduce((sum,item)=>sum+item.faceUsd*(item.couponRate??0),0);
  const reportedAnnualCarry=finite(snapshot.annualExpensesUsd??snapshot.annualPreferredDividendUsd??0,'Reported annual carry');
  return {version:'treasury-instruments-1',asOf,initialAsOf:asOf,policy,instruments,initialKnownAnnualCarry,
    residualAnnualCarry:Math.max(0,reportedAnnualCarry-initialKnownAnnualCarry),events:[],
    conventions:{dayCount:'ACT/365.25 daily cost allocation; not contractual coupon payment dates',conversion:'Only reviewed unconditional windows and an explicit all-share settlement assumption; early conditional rights are not inferred. The MSTR model excludes the final 30 calendar days before maturity; this is a conservative scenario restriction, not the contractual end date',
      unresolvedCarry:'Reported aggregate cash-cost proxy less identified coupons/dividends; held constant',unpaid:'Unpaid settlement moves to separately retained liabilities; default penalties and legal remedies are not estimated'}};
}

export function advanceInstrumentLedger(ledger,{from,to,commonPrice}={}){
  const first=utcDay(from),last=utcDay(to);
  if(last<first||from!==ledger.asOf)throw new RangeError('Instrument transitions must advance from their current date');
  finite(commonPrice,'Common share price');
  const events=[],payments=[];
  let carryUsd=ledger.residualAnnualCarry*(last-first)/YEAR,convertedDebtUsd=0,convertedPreferredUsd=0,conversionShares=0;
  const instruments=ledger.instruments.map(item=>{
    if(item.status!=='outstanding')return {...item};
    let settlementDate=null,settlementKind=null;
    const conversion=item.conversion;
    if(ledger.policy==='convert-at-window'&&conversion&&to>=conversion.from&&(!conversion.modelWindowEnd||to<=conversion.modelWindowEnd)&&(!item.maturityDate||to<item.maturityDate)&&commonPrice*conversion.sharesPerUsd>=1){
      settlementDate=to;settlementKind='converted';
    }
    const dueDate=ledger.policy==='cash-at-put'&&item.putDate>ledger.initialAsOf?item.putDate:item.maturityDate;
    if(dueDate&&dueDate<=to&&(!settlementDate||dueDate<=settlementDate)){settlementDate=dueDate<from?from:dueDate;settlementKind='cash-due';}
    const activeDays=Math.max(0,(settlementDate?utcDay(settlementDate):last)-first);
    const couponUsd=item.outstandingUsd*(item.couponRate??0)*activeDays/YEAR;
    carryUsd+=couponUsd;
    if(!settlementDate)return {...item};
    const event={id:item.id,date:settlementDate,kind:settlementKind,claim:item.kind,faceUsd:item.outstandingUsd,couponUsd,sourceIds:item.sourceIds};
    if(settlementKind==='converted'){
      const shares=item.outstandingUsd*conversion.sharesPerUsd;
      conversionShares+=shares;
      if(item.kind==='debt')convertedDebtUsd+=item.outstandingUsd;else convertedPreferredUsd+=item.outstandingUsd;
      event.shares=shares;
    }else payments.push({id:item.id,kind:item.kind,amountUsd:item.outstandingUsd,date:settlementDate});
    events.push(event);
    return {...item,outstandingUsd:0,status:settlementKind,settlementDate};
  });
  for(const [name,value] of Object.entries({carryUsd,convertedDebtUsd,convertedPreferredUsd,conversionShares}))finite(value,name);
  return {ledger:{...ledger,asOf:to,instruments,events:[...ledger.events,...events]},carryUsd,convertedDebtUsd,convertedPreferredUsd,conversionShares,payments,events};
}

export function instrumentSummary(ledger){
  return {policy:ledger.policy,knownAnnualCarry:ledger.instruments.reduce((sum,item)=>sum+item.outstandingUsd*(item.couponRate??0),0),
    residualAnnualCarry:ledger.residualAnnualCarry,outstandingDebtUsd:ledger.instruments.filter(item=>item.kind==='debt').reduce((sum,item)=>sum+item.outstandingUsd,0),
    outstandingPreferredUsd:ledger.instruments.filter(item=>item.kind==='preferred').reduce((sum,item)=>sum+item.outstandingUsd,0),
    convertedShares:ledger.events.reduce((sum,item)=>sum+(item.shares||0),0),
    unresolvedTerms:ledger.instruments.filter(item=>item.termsStatus!=='reviewed-summary').map(item=>item.id),
    instruments:ledger.instruments.map(({id,label,kind,outstandingUsd,status,couponRate,putDate,maturityDate,termsStatus,sourceIds})=>({id,label,kind,outstandingUsd,status,couponRate,putDate,maturityDate,termsStatus,sourceIds}))};
}
