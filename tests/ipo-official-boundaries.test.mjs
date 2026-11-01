import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {applyObservedPreset,assembleCandidate,coverageOf,evaluateFixture,findListingTable,parseBoardPage,parseOpenDartPage,parsePeriod,parseViewerDocument,refreshOfficial,viewerBodyPath} from '../scripts/refresh-ipo-official.mjs';
import {documentLinks,findOfferFields} from '../scripts/lib/ipo-official-html.mjs';

const cases = JSON.parse(await readFile(new URL('./fixtures/ipo-official/cases.json',import.meta.url),'utf8')).cases;
const positive = cases.find(item=>item.id==='synthetic-table-sample');
const listing = '<table><tr><td>지분증권 등 상장을 위한 공모여부</td><td>코스닥시장 신규상장</td></tr></table>';
const dates = '<table><tr><td>청약기일</td><td>납입기일</td></tr><tr><td>2026년 11월 02일 ~ 2026년 11월 03일</td><td>2026년 11월 06일</td></tr></table>';

test('a dated old filing cannot revive a newer same-name withdrawal',()=>{
  const fixture = structuredClone(cases.find(item=>item.id==='withdrawal-stale-summary'));
  fixture.documents = [{rcpNo:'20261012000149',html:listing+dates}];
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,0);
  assert.ok(result.review.some(row=>row.correctionConflict.some(conflict=>conflict.type==='same_name_different_rcp')));
});

test('a nearby paragraph cannot replace a negative value in the actual listing field',()=>{
  const html='<table><tr><td>지분증권 등 상장을 위한 공모여부</td><td>해당없음</td></tr></table><p>비교 대상: 코스닥시장 신규상장</p>';
  assert.equal(findListingTable(html).value,null);
  assert.equal(findListingTable('<!--'+listing+'-->').found,false);
  assert.equal(findListingTable(listing+html).value,null,'different field values are ambiguous, not a first-positive wins');
});

test('a missing or malformed subscription date cannot be a verified schedule candidate',()=>{
  const fixture=structuredClone(positive);
  fixture.board[0]=fixture.board[0].replace('2026.11.02~2026.11.03','-');
  fixture.openDart=[];
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,0);
  assert.ok(result.review.some(row=>row.reasons.includes('subscription_date_unconfirmed')));
});

test('OpenDART duplicate row fingerprints cannot disguise a missing page row',()=>{
  const html=positive.openDart[0];
  const first=parseOpenDartPage(html.replace('[1/1] [총 1건]','[1/2] [총 2건]'));
  const second=parseOpenDartPage(html.replace('[1/1] [총 1건]','[2/2] [총 2건]'));
  const coverage=coverageOf([first,second],2);
  assert.equal(coverage.complete,false);
  assert.equal(coverage.uniqueRows,1);
  assert.equal(coverage.duplicateIdentities.length,1);
});

test('the response page numbers must cover the declared sequence, not only be different',()=>{
  const first={coverage:{page:2,pages:2,total:2},rows:[{number:1,rcpNo:'20261101000001'}]};
  const second={coverage:{page:3,pages:2,total:2},rows:[{number:2,rcpNo:'20261101000002'}]};
  assert.equal(coverageOf([first,second],2).complete,false);
});

test('the collection window and source day use Seoul even before UTC midnight',()=>{
  assert.equal(applyObservedPreset(new Date('2026-10-31T16:30:00Z'),3).endDe,'2026-11-01');
  assert.equal(applyObservedPreset(new Date('2026-10-31T16:30:00Z'),3).bgnDe,'2026-05-01');
});

test('only exact family/ref receipt links are lineage, never an attachment or injected URL',()=>{
  const html='<select id="family"><option value="rcpNo=20260909000381" title="증권신고서(지분증권)">2026.09.09 [정정] 증권신고서(지분증권)</option></select><select id="ref"><option value="https://example.invalid/?rcpNo=20260929000194" title="투자설명서">2026.09.29 투자설명서</option></select><select id="att"><option value="rcpNo=20260929000194" title="투자설명서">2026.09.29 예비투자설명서</option></select>';
  assert.deepEqual(documentLinks(html).map(link=>link.rcpNo),['20260909000381']);
  assert.equal(viewerBodyPath({rcpNo:'20260929000191',dcmNo:'11593609',dtd:'dart4.xsd&extra=1'}),null);
});

test('nested tree node variables are retained instead of selecting only the first-level node',()=>{
  const html="node1['text'] = \"요약정보\"; node1['rcpNo'] = \"20260909000381\"; node1['dcmNo'] = \"11572589\"; node1['eleId'] = \"5\"; node1['offset'] = \"100\"; node1['length'] = \"900\"; node1['dtd'] = \"dart4.xsd\"; node2['text'] = \"2. 모집 또는 매출에 관한 일반사항\"; node2['rcpNo'] = \"20260909000381\"; node2['dcmNo'] = \"11572589\"; node2['eleId'] = \"7\"; node2['offset'] = \"882481\"; node2['length'] = \"16666\"; node2['dtd'] = \"dart4.xsd\";";
  assert.equal(parseViewerDocument(html).nodes.length,2);
  assert.equal(parseViewerDocument(html).nodes[1].eleId,'7');
});

test('an external export action is never called by candidate collection',async()=>{
  const calls=[];
  const result=await refreshOfficial({offlineFixture:true,samples:[],now:new Date('2026-11-01T00:00:00Z'),fetchImpl:async(url,init)=>{
    calls.push({url:String(url),redirect:init.redirect});
    const parsed=new URL(url);
    assert.ok(['https://dart.fss.or.kr','https://opendart.fss.or.kr'].includes(parsed.origin),'external origin was called');
    if(['/dsac005/main.do','/disclosureinfo/scrits/main.do'].includes(parsed.pathname))return new Response('<form id="searchForm"><input name="pageIndex" value="1"><input name="currentPage" value="1"></form>');
    if(parsed.pathname==='/dsac005/search.ax')return new Response(positive.board[0]);
    if(parsed.pathname==='/disclosureinfo/scrits/list.do')return new Response(positive.openDart[0]+'<form name="formDownload" action="https://example.invalid/collect"><input name="x" value="1"></form>');
    if(parsed.pathname==='/dsac008/main.do')return new Response('<select id="year"><option value="2026" selected>2026</option></select><select id="month"><option value="11" selected>11</option></select>');
    throw new Error('unexpected fixture path '+parsed.pathname);
  }});
  assert.equal(result.marketComplete,false);
  assert.equal(calls.some(call=>call.url.includes('example.invalid')),false);
  assert.ok(calls.every(call=>call.redirect==='manual'));
});

test('an official-host redirect is not followed into an unobserved destination',async()=>{
  const calls=[];
  const result=await refreshOfficial({offlineFixture:true,samples:[],fetchImpl:async(url,init)=>{calls.push({url:String(url),redirect:init.redirect});return new Response(null,{status:302,headers:{location:'https://example.invalid/collect'}});}});
  assert.equal(result.status,'source_failed');
  assert.equal(calls.length,1,'a denied first source ends the attempt');
  assert.equal(calls[0].redirect,'manual');
});

test('observed old and latest summaries keep IPO identity but not the old price',async()=>{
  const captured=JSON.parse(await readFile(new URL('./fixtures/ipo-official/observed-melcon-tables.json',import.meta.url),'utf8'));
  assert.equal(findListingTable(captured.old.html).value,'코스닥시장 신규상장');
  assert.equal(findListingTable(captured.latest.html).value,'코스닥시장 신규상장');
  assert.equal(findOfferFields(captured.old.html).price.priceText,'10,700');
  assert.equal(findOfferFields(captured.latest.html).price.priceText,'12,300');
  assert.equal(findOfferFields(captured.latest.html).dates.subscriptionText,'2026년 10월 01일 ~ 2026년 10월 02일');
});

function withOlderSummary(linked=true) {
  const fixture=structuredClone(positive),current=fixture.documents[0].rcpNo,older='20260101000001';
  fixture.openDart[0]=fixture.openDart[0].replaceAll(current,older).replaceAll('2026년 11월 02일 ~ 2026년 11월 03일','2026년 11월 04일 ~ 2026년 11월 05일');
  if(linked)fixture.documents[0].familyLinks=[current,older].map(rcpNo=>({control:'family',rcpNo,title:'증권신고서(지분증권)',receiptDate:rcpNo===current?'2026-10-30':'2026-10-01'}));
  fixture.documents[0].currentReceiptDate='2026-10-30';
  return {fixture,current,older};
}

test('observed filing-family links resolve an older summary without replacing current original dates',()=>{
  const {fixture,current,older}=withOlderSummary();
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,1);
  assert.equal(result.candidates[0].rcpNo,current);
  assert.equal(result.candidates[0].period.start,'2026-11-02');
  assert.equal(result.candidates[0].sourceNotices[0].summaryPeriod.start,'2026-11-04');
  assert.equal(result.review.find(row=>row.rcpNo===older).supersededBy,current);
  assert.equal(result.review.find(row=>row.rcpNo===older).verified,false);
});

test('the same company names and periods without a family link are not enough to merge receipts',()=>{
  const {fixture}=withOlderSummary(false);
  assert.equal(evaluateFixture(fixture).candidates.length,0);
});

test('a family link cannot excuse a mismatch between the current board and current original',()=>{
  const {fixture}=withOlderSummary();
  fixture.documents[0].html=fixture.documents[0].html.replace('2026년 11월 02일 ~ 2026년 11월 03일','2026년 11월 04일 ~ 2026년 11월 05일');
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,0);
  assert.ok(result.review.some(row=>row.reasons.includes('document_subscription_mismatch')));
});

test('a linked old positive original is still superseded by the newer withdrawal',()=>{
  const fixture=structuredClone(cases.find(item=>item.id==='withdrawal-stale-summary'));
  const newer=parseBoardPage(fixture.board[0]).rows[0].rcpNo;
  const older=parseOpenDartPage(fixture.openDart[0]).rows[0].rcpNo;
  fixture.documents=[{rcpNo:older,html:listing+dates,currentReceiptDate:'2026-10-12',familyLinks:[newer,older].map(rcpNo=>({control:'family',rcpNo,title:'증권신고서(지분증권)'}))}];
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,0);
  assert.equal(result.review.find(row=>row.rcpNo===older).supersededBy,newer);
});

test('two same-day board receipts in one observed family are not ordered by serial number',()=>{
  const page=parseBoardPage(positive.board[0]),first=page.rows[0],second={...first,number:2,rcpNo:'20261101000999'};
  const familyLinks=[first.rcpNo,second.rcpNo].map(rcpNo=>({control:'family',rcpNo,title:'증권신고서(지분증권)'}));
  const result=assembleCandidate({checkedAt:'2026-11-01T00:00:00Z',boardPages:[{coverage:{page:1,pages:1,total:2},rows:[first,second]}],documents:[{rcpNo:first.rcpNo,read:true,table:findListingTable(listing),offer:{period:parsePeriod('2026.11.02~2026.11.03')},familyLinks,currentReceiptDate:first.receipt}]});
  assert.equal(result.candidates.length,0);
  assert.ok(result.review.every(row=>!row.supersededBy));
});

test('calendar start/end must agree with the actual current original',()=>{
  const fixture=structuredClone(positive),rcpNo=fixture.documents[0].rcpNo;
  fixture.calendars=[{year:2026,month:11,events:[{day:4,rcpNo,edge:'start',text:'[시작] 합성'},{day:5,rcpNo,edge:'end',text:'[종료] 합성'}]}];
  const result=evaluateFixture(fixture);
  assert.equal(result.candidates.length,0);
  assert.ok(result.review.some(row=>row.reasons.includes('calendar_subscription_mismatch')));
});

test('list completeness does not disguise a failed requested document or unavailable calendar month',()=>{
  const page=parseBoardPage(positive.board[0]);
  const result=assembleCandidate({checkedAt:'2026-11-01T00:00:00Z',boardPages:[page],documents:[{rcpNo:page.rows[0].rcpNo,read:false,error:'body_url_not_in_html'}],calendarGaps:[{reason:'month_not_offered'}]});
  assert.equal(result.coverage.listsComplete,true);
  assert.equal(result.coverage.documentsComplete,false);
  assert.equal(result.coverage.calendarComplete,false);
  assert.equal(result.coverage.complete,false);
});

test('actual shorthand dates retain the end day and explicitly record inferred components',()=>{
  const korean=parsePeriod('2026년 11월 03일 ~ 11월 04일');
  assert.equal(korean.start,'2026-11-03');assert.equal(korean.end,'2026-11-04');assert.deepEqual(korean.inferred,['end-year']);
  assert.equal(parsePeriod('2026.12.31~01.02').end,'2027-01-02');
  assert.equal(parsePeriod('2026.10.30~02').end,'2026-11-02');
  assert.equal(parsePeriod('2026.11.04~11.03').reversed,true);
  assert.equal(parsePeriod('2026년 11월 03일 ~ 미정').unparsed,true);
});

test('price ambiguity is not silently promoted and does not erase unambiguous subscription dates',()=>{
  const first='<table><tr><td>증권수량</td><td>모집(매출)가액</td></tr><tr><td>100</td><td>10,000</td></tr></table>';
  const second=first.replace('10,000','12,000');
  const fields=findOfferFields(first+second+dates);
  assert.equal(fields.price,null);assert.equal(fields.ambiguousPrice,true);assert.equal(fields.ambiguousDates,false);
  assert.ok(fields.dates);
});

test('the normal live path records a policy blocker before any HTTP request',async()=>{
  let calls=0;
  const result=await refreshOfficial({fetchImpl:async()=>{calls++;throw new Error('network must not be called');}});
  assert.equal(calls,0);assert.equal(result.status,'blocked_source_policy');assert.equal(result.coverage.complete,false);assert.equal(result.verified,false);
  assert.deepEqual(result.sourcePolicy.disallowedPaths,['/dsaf001/main.do','/report/viewer.do']);
});

test('a candidate alias cannot overwrite a protected calendar filename',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ipo-output-guard-'));
  try {
    const target=join(dir,'ipo-calendar.json'),alias=join(dir,'candidate.json');await writeFile(target,'KEEP');await symlink(target,alias);
    await assert.rejects(()=>refreshOfficial({out:alias}),/refusing to replace published IPO data/);
    assert.equal(await readFile(target,'utf8'),'KEEP');
  } finally {await rm(dir,{recursive:true,force:true});}
});
