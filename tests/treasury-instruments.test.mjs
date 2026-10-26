import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstrumentLedger,advanceInstrumentLedger,instrumentSummary,REVIEWED_MSTR_INSTRUMENTS} from '../dist/treasury-instruments.js';
import {TREASURY_SNAPSHOTS} from '../dist/treasury-research.js';
import {buildTreasuryForecast} from '../dist/treasury-model.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const asOf='2026-10-23';
const custom=(changes={})=>({coin:'BTC',asOf:'2026-06-30',publishedAt:'2026-07-30',debtUsd:100,preferredUsd:0,annualExpensesUsd:10,sourceIds:['fixture'],instruments:[{id:'note',kind:'debt',label:'Fixture',faceUsd:100,couponRate:.1,putDate:'2026-11-01',maturityDate:'2027-01-01',publishedAt:'2026-07-30',termsStatus:'reviewed-summary',sourceIds:['fixture'],conversion:{from:'2026-12-01',sharesPerUsd:.1,eligibility:'unconditional-window-only'}}],...changes});

test('reviewed June MSTR notes reconcile current source principal, not inception principal',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:TREASURY_SNAPSHOTS.MSTR,asOf});
  assert.equal(REVIEWED_MSTR_INSTRUMENTS.length,6);
  assert.equal(ledger.instruments.filter(item=>item.kind==='debt').reduce((s,item)=>s+item.faceUsd,0),6_713_659_000);
  assert.equal(ledger.instruments.find(item=>item.id==='mstr-notes-2029').faceUsd,1_500_000_000);
  near(ledger.initialKnownAnnualCarry,34_594_516.25);
  near(ledger.residualAnnualCarry+ledger.initialKnownAnnualCarry,1_760_000_000);
  assert.deepEqual(instrumentSummary(ledger).unresolvedTerms,['unallocated-preferred']);
});

test('a cash settlement occurs once and its coupon ceases at the settlement date',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:custom(),asOf});
  const first=advanceInstrumentLedger(ledger,{from:asOf,to:'2026-11-03',commonPrice:20});
  near(first.carryUsd,100*.1*9/365.25);
  assert.deepEqual(first.payments.map(item=>item.amountUsd),[100]);
  const second=advanceInstrumentLedger(first.ledger,{from:'2026-11-03',to:'2026-12-03',commonPrice:20});
  assert.equal(second.carryUsd,0);assert.equal(second.payments.length,0);
  assert.equal(second.ledger.events.length,1);
  assert.equal(ledger.instruments[0].outstandingUsd,100,'transition preserves its input');
});

test('conversion requires its reviewed window and removes the claim while adding shares once',()=>{
  let ledger=createInstrumentLedger({symbol:'MSTR',snapshot:custom(),asOf,policy:'convert-at-window'});
  let step=advanceInstrumentLedger(ledger,{from:asOf,to:'2026-11-15',commonPrice:100});
  assert.equal(step.conversionShares,0);assert.equal(step.payments.length,0,'put exercise is explicitly waived by this assumption');
  step=advanceInstrumentLedger(step.ledger,{from:'2026-11-15',to:'2026-12-01',commonPrice:9});
  assert.equal(step.conversionShares,0,'an out-of-the-money conversion is not forced');
  step=advanceInstrumentLedger(step.ledger,{from:'2026-12-01',to:'2026-12-02',commonPrice:10});
  assert.equal(step.convertedDebtUsd,100);assert.equal(step.conversionShares,10);
  const after=advanceInstrumentLedger(step.ledger,{from:'2026-12-02',to:'2027-01-02',commonPrice:100});
  assert.equal(after.carryUsd,0);assert.equal(after.payments.length,0);assert.equal(after.conversionShares,0);
});

test('a coarse-step end price cannot move a conversion back to an earlier eligibility date',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:custom(),asOf,policy:'convert-at-window'});
  const step=advanceInstrumentLedger(ledger,{from:asOf,to:'2026-12-15',commonPrice:20});
  assert.equal(step.events[0].date,'2026-12-15');
  near(step.carryUsd,10*53/365.25);
});

test('a maturity remains payable when an eligible conversion stays out of the money',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:custom(),asOf,policy:'convert-at-window'});
  const step=advanceInstrumentLedger(ledger,{from:asOf,to:'2027-01-01',commonPrice:9});
  assert.equal(step.conversionShares,0);assert.equal(step.payments[0].amountUsd,100);
});

test('reviewed MSTR excludes the final thirty days under an explicit model restriction, not an invented business calendar',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:TREASURY_SNAPSHOTS.MSTR,asOf,policy:'convert-at-window'});
  const note=ledger.instruments.find(item=>item.id==='mstr-notes-2028');
  assert.equal(note.conversion.modelWindowEnd,'2028-08-16');
  assert.match(ledger.conventions.conversion,/scenario restriction/);
  const late=advanceInstrumentLedger(ledger,{from:asOf,to:'2028-08-17',commonPrice:1e6});
  assert.equal(late.ledger.instruments.find(item=>item.id===note.id).status,'outstanding');
  const due=advanceInstrumentLedger(late.ledger,{from:'2028-08-17',to:'2028-09-15',commonPrice:1e6});
  assert.equal(due.payments.find(item=>item.id===note.id).amountUsd,note.faceUsd);
});

test('unknown instrument coupons preserve the disclosed aggregate proxy without inventing a rate',()=>{
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:custom({instruments:undefined,debtSchedule:[{date:'2026-11-01',principalUsd:100}]}),asOf});
  assert.equal(ledger.instruments[0].couponRate,null);assert.equal(ledger.residualAnnualCarry,10);
  const step=advanceInstrumentLedger(ledger,{from:asOf,to:'2026-11-23',commonPrice:20});
  near(step.carryUsd,10*31/365.25);
  assert.equal(instrumentSummary(step.ledger).unresolvedTerms.length,1);
});

test('unreviewed, future, duplicate and unreconciled contracts fail at the input boundary',()=>{
  const base=custom(),item=base.instruments[0];
  for(const instruments of [[{...item,publishedAt:'2026-11-01'}],[{...item,faceUsd:90}],[item,item],[{...item,termsStatus:'unresolved'}],[{...item,conversion:{...item.conversion,eligibility:'assumed-early'}}]])
    assert.throws(()=>createInstrumentLedger({symbol:'MSTR',snapshot:{...base,instruments},asOf}));
  const ledger=createInstrumentLedger({symbol:'MSTR',snapshot:base,asOf});
  assert.throws(()=>advanceInstrumentLedger(ledger,{from:'2026-10-22',to:'2026-10-25',commonPrice:20}),/current date/);
});
test('contradictory capital dates cannot postpone a maturity or create an invalid conversion window',()=>{
  const base=custom(),item=base.instruments[0];
  for(const changed of [{putDate:'2027-06-01'},{maturityDate:'2026-11-30'},{conversion:{...item.conversion,from:'2027-02-01'}},{conversion:{...item.conversion,modelWindowEnd:'2027-02-01'}}])
    assert.throws(()=>createInstrumentLedger({symbol:'MSTR',snapshot:{...base,instruments:[{...item,...changed}]},asOf}),/date|window|maturity|put/i);
});

test('reviewed coupons disappear from runtime cash costs after actual model principal settlements',()=>{
  const forecast=buildTreasuryForecast({symbol:'MSTR',history:[{date:asOf,close:146.01}],scenario:'base',endYear:2035});
  assert.equal(forecast.instruments.instruments.filter(item=>item.kind==='debt'&&item.outstandingUsd>0).length,0);
  assert.equal(forecast.instruments.knownAnnualCarry,0);
  assert.equal(forecast.instrumentEvents.filter(item=>item.kind==='cash-due').length,6);
  assert.ok(forecast.path.at(-1).components.totalFinancingCost>0);
});

test('BMNP starts from the disclosed preferred adjustment and carries a distinct unconverted claim',()=>{
  const forecast=buildTreasuryForecast({symbol:'BMNR',history:[{date:asOf,close:22.4}],scenario:'base',endYear:2027});
  const preferred=forecast.instruments.instruments.find(item=>item.id==='bmnr-bmnp-initial');
  assert.equal(preferred.outstandingUsd,350_000_000);assert.equal(preferred.couponRate,.095);
  assert.equal(forecast.instruments.residualAnnualCarry,0);
  assert.equal(forecast.path[0].components.preferredUsd,350_000_000);
});
