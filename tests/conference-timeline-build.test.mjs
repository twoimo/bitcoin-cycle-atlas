import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  POLICY,parseSrt,createSourceInventory,deriveLectureRanges,validatePrograms,
  validatePageQuarantine,mapLectureRows,monotoneCandidates,generateArtifacts,
} from '../scripts/build-conference-timeline.mjs';
import {validateConferenceTimeline} from '../dist/conference/timeline.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const root = new URL('..',import.meta.url);
const readJson = async path => JSON.parse(await readFile(new URL(path,root),'utf8'));
const srt = (id,start,end,text,newline='\n') => [String(id),start+' --> '+end,text,''].join(newline)+newline;
const one = Buffer.from(srt(1,'00:00:01,230','00:00:02,340',' 원본  '));
const source = (id,bytes,offsetSeconds=0,durationSec=10) => ({id,bytes,file:'inputs/'+id+'.srt',sha256:sha(bytes),offsetSeconds,durationSec,clockStart:offsetSeconds?'12:33:10':'12:33:00'});

test('SRT parser preserves exact whitespace and internal CRLF while retaining overlaps and integer-millisecond offsets',()=>{
  const bytes=Buffer.from(srt(1,'00:00:01,230','00:00:02,340','  첫 줄  \r\n 둘째 줄\t','\r\n')+
    srt(2,'00:00:02,000','00:00:03,001',' 겹친 원문 ','\r\n'));
  const rows=parseSrt(bytes,{audioId:'plaud-2',offsetSeconds:18000,durationSec:2400});
  assert.deepEqual(rows,[
    {source:'plaud-2#1',audioId:'plaud-2',t0:18001.23,t1:18002.34,text:'  첫 줄  \r\n 둘째 줄\t'},
    {source:'plaud-2#2',audioId:'plaud-2',t0:18002,t1:18003.001,text:' 겹친 원문 '},
  ]);
  assert.ok(rows[1].t0<rows[0].t1,'Source overlap must not be repaired, split, or merged');
});

test('SRT parser rejects corrupt source blocks instead of sorting, deduplicating, or filling their IDs',()=>{
  const parse=bytes=>parseSrt(bytes,{audioId:'plaud-1',offsetSeconds:0,durationSec:10});
  for(const bytes of [
    Buffer.from(srt(2,'00:00:01,000','00:00:02,000','missing first')),
    Buffer.from(srt(1,'00:00:01,000','00:00:02,000','first')+srt(1,'00:00:02,000','00:00:03,000','duplicate')),
    Buffer.from(srt(1,'00:00:03,000','00:00:04,000','first')+srt(2,'00:00:02,000','00:00:03,000','out of order')),
    Buffer.from(srt(1,'00:00:01,000','00:00:01,000','zero duration')),
    Buffer.from(srt(1,'00:00:09,000','00:00:10,001','overrun')),
    Buffer.from(srt(1,'00:60:00,000','00:60:01,000','invalid clock')),
    Buffer.from([0xff,0xfe,0xff]),
  ]) assert.throws(()=>parse(bytes));
});

test('independent source inventory enforces input digests and the 18000-second second-recording offset',()=>{
  const first=source('plaud-1',one,0,18000),second=source('plaud-2',one,18000,2400);
  const inventory=createSourceInventory([first,second]);
  assert.equal(inventory.kind,'atlas-conference-source-segments');
  assert.equal(inventory.segments.length,2);
  assert.equal(inventory.segments[1].t0,18001.23);
  assert.equal(inventory.segments[1].text,inventory.segments[0].text);
  assert.throws(()=>createSourceInventory([{...first,sha256:'0'.repeat(64)},second]),/SHA-256/);
  assert.throws(()=>createSourceInventory([first,{...second,offsetSeconds:17999}]),/offset/);
});

test('monotone candidate alignment drops backward evidence and retains exact gaps without page filling',()=>{
  const chosen=monotoneCandidates([
    {index:0,page:3,score:.31},{index:2,page:1,score:.8},{index:3,page:2,score:.9},{index:7,page:2,score:.7},
  ],[1,3]);
  assert.deepEqual([...chosen.keys()].sort((a,b)=>a-b),[2,3,7]);
  assert.deepEqual([...chosen.values()].sort((a,b)=>a.index-b.index).map(item=>item.page),[1,2,2]);
  assert.equal(chosen.has(1),false);assert.equal(chosen.has(4),false);
  assert.throws(()=>monotoneCandidates([{index:0,page:4,score:1}],[1,3]),/outside lecture/);
});

const pages=[
  {page:1,text:'semiconductor fabrication lithography transistor silicon'},
  {page:2,text:'residential apartment transaction mortgage inventory'},
  {page:3,text:'robotics autonomy navigation sensor actuator'},
];
const lecture={id:'01',kind:'lecture',t0:0,t1:60};
const row=(index,t0,t1,text)=>({source:'plaud-1#'+index,audioId:'plaud-1',t0,t1,text});

test('clear lecture-local text produces an auditable candidate while long and cross-boundary source rows stay null',()=>{
  const rows=[row(1,0,40,pages[0].text),row(2,41,42,pages[1].text),row(3,59,61,pages[2].text)];
  const mapped=mapLectureRows(rows,lecture,pages,[1,3]);
  assert.equal(mapped[0].page,null);assert.equal(mapped[0].reason,'long-source-segment');
  assert.equal(mapped[1].page,2);assert.ok(mapped[1].candidate.score>=POLICY.minimumScore);
  assert.ok(mapped[1].candidate.directSharedFeatures.length>=POLICY.minimumDirectSharedFeatures);
  assert.equal(mapped[2].page,null);assert.equal(mapped[2].reason,'program-boundary-straddling');
  assert.equal(rows[0].text,pages[0].text,'Candidate normalization cannot change original text');
});

test('non-lecture, ambiguous and unsupported source rows never gain a page from neighboring candidates',()=>{
  const rows=[row(1,10,11,pages[0].text)];
  assert.equal(mapLectureRows(rows,{...lecture,kind:'break'},pages,[1,3])[0].reason,'non-lecture');
  const ambiguous=mapLectureRows(rows,lecture,[pages[0],{page:2,text:pages[0].text}],[1,2]);
  assert.equal(ambiguous[0].page,null);assert.equal(ambiguous[0].reason,'ambiguous-page-candidates');
  const unrelated=mapLectureRows([row(1,10,11,'volcano eruption magma tectonic geology')],lecture,pages,[1,3]);
  assert.equal(unrelated[0].page,null);assert.equal(unrelated[0].reason,'below-confidence-threshold');
});

test('quarantined or out-of-lecture pages cannot become candidates even on an exact text match',()=>{
  const rows=[row(1,10,11,pages[0].text)];
  assert.equal(mapLectureRows(rows,lecture,pages,[1,3],POLICY,[1])[0].page,null);
  assert.equal(mapLectureRows(rows,lecture,pages,[2,3])[0].page,null);
});

test('vocabulary projection does not turn n-grams of a single long word into independent evidence',()=>{
  const repeated='정보통신반도체제조공정';
  const mapped=mapLectureRows([row(1,10,11,repeated)],lecture,[
    {page:1,text:repeated+' 투자 분석'},{page:2,text:'아파트 거래량 주택 시장'},
  ],[1,2]);
  assert.equal(mapped[0].page,null);assert.equal(mapped[0].reason,'insufficient-independent-lexical-words');
  assert.ok(mapped[0].candidate.sharedFeatures.length>=POLICY.minimumSharedFeatures);
  assert.equal(mapped[0].candidate.sharedLexicalWords.length,1);
});

test('later subtitle text cannot become the current row’s page evidence',()=>{
  const first=row(1,10,11,'semiconductor'),later=row(2,12,13,pages[0].text);
  const mapped=mapLectureRows([first,later],lecture,pages,[1,3]);
  assert.equal(mapped[0].page,null,'A future sentence must not supply the missing current evidence');
  assert.deepEqual(mapped[0].candidate.contextSources,[first.source,first.source]);
  assert.equal(mapped[1].page,1);
});

test('page quarantine is evidence-bound and rejects altered original extraction text',()=>{
  const pageTexts={deck:{pages:[{page:1,text:' exact original '}]}},boundaries={
    excludedFromAutomaticMapping:{deck:[1]},pageOwnershipConflicts:[{deck:'deck',page:1,excludedFromAutomaticMapping:true,evidence:{page:1,textExact:' exact original '}}],
  };
  assert.deepEqual(validatePageQuarantine(boundaries,pageTexts),{deck:[1]});
  assert.throws(()=>validatePageQuarantine({...boundaries,pageOwnershipConflicts:[]},pageTexts),/requires explicit source evidence/);
  const altered=structuredClone(boundaries);altered.pageOwnershipConflicts[0].evidence.textExact='exact original';
  assert.throws(()=>validatePageQuarantine(altered,pageTexts),/changed supplied page text/);
});

let actual;
const artifacts=()=>actual??=generateArtifacts();
test('locked actual bundle preserves all 9168 raw rows including the SRT2 offset without fabricating documented row 7995',async()=>{
  const built=await artifacts(),rows=built.inventory.segments;
  assert.equal(rows.length,9168);assert.equal(rows.filter(row=>row.audioId==='plaud-1').length,7994);
  assert.equal(rows.filter(row=>row.audioId==='plaud-2').length,1174);
  assert.equal(rows.find(row=>row.source==='plaud-2#1').t0,18025.63);
  assert.equal(rows.at(-1).t1,20396.7);assert.equal(rows.some(row=>row.source==='plaud-1#7995'),false);
  // An independent line-oriented reader compares original caption payloads;
  // this does not read the generated timeline back into its own source fixture.
  let offset=0;
  for(const sourceFile of built.inventory.provenance.files){
    const lines=(await readFile(new URL(sourceFile.file,root),'utf8')).split('\n'),sourceTexts=[];
    for(let line=0;line<lines.length;){
      if(!lines[line]){line++;continue;}
      assert.match(lines[line++],/^\d+$/);assert.match(lines[line++],/ --> /);
      const caption=[];while(line<lines.length&&lines[line]!=='')caption.push(lines[line++]);sourceTexts.push(caption.join('\n'));
    }
    assert.deepEqual(rows.slice(offset,offset+sourceTexts.length).map(row=>row.text),sourceTexts);
    offset+=sourceTexts.length;
  }
  const validation=validateConferenceTimeline(built.timeline,{sourceSegments:rows,requireCoverage:true});
  assert.equal(validation.valid,true);assert.deepEqual(validation.summary.coverage,{checked:true,expectedCount:9168,missing:[],unexpected:[],duplicates:[],changed:[]});
});

test('actual program/range policy retains 15 slots, excludes ownership conflicts, and rejects changes to locked declarations',async()=>{
  const built=await artifacts(),boundaries=await readJson('docs/conference/program-boundaries-20261112.json');
  assert.equal(built.timeline.talks.length,15);
  const missing=structuredClone(boundaries);missing.programs.splice(4,1);assert.throws(()=>validatePrograms(missing,built.inventory),/15 distinct/);
  const decks=built.timeline.decks;assert.deepEqual(decks.map(deck=>deck.id),['final-290','r17-clean-257']);
  const r17=built.timeline.talks.find(talk=>talk.id==='08').pageRange['r17-clean-257'];assert.deepEqual(r17,[89,120]);
  for(const program of boundaries.programs){
    const rows=built.timeline.segments.filter(row=>row.talk===program.id);
    if(program.kind!=='lecture')assert.ok(rows.every(row=>row.page===null));
    for(const deck of decks){let previous=0;const range=built.timeline.talks.find(talk=>talk.id===program.id).pageRange[deck.id];
      for(const row of rows){const page=row.page?.[deck.id];if(page==null)continue;
        assert.ok(range&&page>=range[0]&&page<=range[1]);assert.ok(page>=previous);previous=page;
        assert.equal(boundaries.excludedFromAutomaticMapping[deck.id].includes(page),false);
        assert.ok(row.t1-row.t0<=POLICY.maxSegmentSeconds&&row.t1<=program.t1);
      }
    }
  }
  assert.ok(built.timeline.audio.every(audio=>audio.available===false));assert.ok(decks.every(deck=>deck.imagesAvailable===false));
  const inputs=await readJson('docs/conference/inputs/deck-inputs.json'),lock=await readJson('docs/conference/deck-lock-20261112.json');
  const pageTexts=Object.fromEntries(await Promise.all(decks.map(async deck=>[deck.id,await readJson('docs/conference/inputs/deck-pages-'+deck.id+'.json')])));
  inputs.sources['final-290'].pdf.sha256='0'.repeat(64);
  assert.throws(()=>deriveLectureRanges({inputs,lock,pageTexts,programs:boundaries.programs}),/Locked PDF identity changed/);
});

test('same script and pinned inputs reproduce every output byte without a wall-clock generatedAt',async()=>{
  const first=await artifacts(),second=await generateArtifacts();
  assert.deepEqual(Object.keys(first.files),Object.keys(second.files));
  for(const file of Object.keys(first.files))assert.deepEqual(first.files[file],second.files[file],file);
  assert.equal(first.quality.humanReview.listeningChecked,0);
  assert.equal(first.quality.humanReview.slideAccuracyVerified,false);
  assert.equal(first.quality.sourceIdentity.originalPdfPptxRehashedHere,false);
});
