#!/usr/bin/env node
// P1b: deterministic source preservation and conservative, reviewable slide drafts.
// This pipeline never edits a locked deck, repairs ASR, or certifies audio sync.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, relative, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, brotliCompressSync, constants as zlibConstants} from 'node:zlib';
import {validateConferenceTimeline} from '../dist/conference/timeline.js';

export const EVENT = Object.freeze({id:'plspo-2026-10-31',title:'플스포 투자 컨퍼런스 2026',date:'2026-10-31',timezone:'Asia/Seoul',clockStart:'12:33:00',clockEnd:'18:13:00'});
export const POLICY = Object.freeze({
  version:'lexical-monotone-draft-v1',contextSeconds:8,contextDirection:'trailing-only',maxSegmentSeconds:30,
  minimumScore:.30,minimumQueryCoverage:.22,minimumMargin:.045,minimumSharedFeatures:4,minimumDirectSharedFeatures:1,
  minimumSharedLexicalWords:2,queryVocabulary:'Known noncommon lecture-page vocabulary; unknown conversational/ASR features are excluded from scoring and their fraction is reported.',
  coverageWeight:.60,cosineWeight:.40,commonFeatureFraction:.65,
  scoreMeaning:'Deterministic lexical evidence score; not a calibrated probability or a listening accuracy measurement.',
  monotonicity:'Maximum-weight nondecreasing subsequence of independently eligible page candidates within each lecture and deck; null rows are never forward-filled.',
});
export const OUTPUT_PATHS = Object.freeze({
  sources:'docs/conference/source-segments.json',timeline:'dist/conference/timeline.json',
  quality:'docs/conference/mapping-quality-20261112.json',markdown:'docs/conference/mapping-quality-20261112.md',
});
const DEFAULT_ROOT = fileURLToPath(new URL('..',import.meta.url));
const INPUT_DIR = 'docs/conference/inputs';
const LOCK_PATH = 'docs/conference/deck-lock-20261112.json';
const BOUNDARIES_PATH = 'docs/conference/program-boundaries-20261112.json';
const GENERATOR_PATH = 'scripts/build-conference-timeline.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compact = value => Buffer.from(JSON.stringify(value)+'\n');
const pretty = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
const rounded = value => Math.round(value*1e6)/1e6;
const rate = (count,total) => total ? Math.round(count/total*10000)/100 : null;
const own = (value,key) => Object.prototype.hasOwnProperty.call(value,key);

function millis(clock) {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d),(\d{3})$/.exec(clock);
  assert.ok(match,'Invalid SRT clock: '+clock);
  return ((Number(match[1])*60+Number(match[2]))*60+Number(match[3]))*1000+Number(match[4]);
}

/** Parse source blocks without trimming or rewriting their subtitle text. */
export function parseSrt(bytes,{audioId,offsetSeconds,durationSec}) {
  assert.ok(typeof audioId==='string'&&audioId.length>0,'SRT audioId missing');
  assert.ok(Number.isInteger(offsetSeconds)&&offsetSeconds>=0,'SRT offset must be nonnegative integer seconds');
  assert.ok(Number.isFinite(durationSec)&&durationSec>0,'SRT duration missing');
  const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const rows = [], blocks = text.split(/\r?\n\r?\n/);
  let previousStart = -1;
  for (let block of blocks) {
    if (!block.length || /^\r?\n$/.test(block)) continue;
    // The final newline belongs to the SRT container, not to the caption.
    if (block.endsWith('\r\n')) block=block.slice(0,-2);
    else if (block.endsWith('\n')) block=block.slice(0,-1);
    const match = /^(\d+)\r?\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\r?\n([\s\S]+)$/.exec(block);
    assert.ok(match,'Malformed SRT block after '+audioId+'#'+rows.length);
    const index=Number(match[1]),start=millis(match[2]),end=millis(match[3]);
    assert.equal(index,rows.length+1,'SRT indices must be contiguous and unique in '+audioId);
    assert.ok(end>start&&end<=durationSec*1000,'Invalid or out-of-audio SRT interval: '+audioId+'#'+index);
    assert.ok(start>=previousStart,'Source starts must already be ordered; parser does not sort captions');
    assert.ok(match[4].trim().length>0,'Empty source subtitle: '+audioId+'#'+index);
    rows.push({source:audioId+'#'+index,audioId,t0:(start+offsetSeconds*1000)/1000,t1:(end+offsetSeconds*1000)/1000,text:match[4]});
    previousStart=start;
  }
  assert.ok(rows.length>0,'No SRT rows: '+audioId);
  return rows;
}

export function createSourceInventory(sourceFiles,{generator}={}) {
  const segments=[],files=[];
  let nextOffset=0,previousStart=-1;
  for(const source of sourceFiles){
    assert.equal(source.offsetSeconds,nextOffset,'Audio source order/offset is not contiguous');
    assert.equal(hash(source.bytes),source.sha256,'SRT SHA-256 differs from deck-inputs: '+source.id);
    const rows=parseSrt(source.bytes,{audioId:source.id,offsetSeconds:source.offsetSeconds,durationSec:source.durationSec});
    for(const row of rows){assert.ok(row.t0>=previousStart,'Combined source order changed');previousStart=row.t0;segments.push(row);}
    files.push({id:source.id,file:source.file,sha256:hash(source.bytes),bytes:source.bytes.length,offsetSeconds:source.offsetSeconds,
      durationSec:source.durationSec,clockStart:source.clockStart,segmentCount:rows.length,firstSource:rows[0].source,lastSource:rows.at(-1).source,
      firstT0:rows[0].t0,lastT1:rows.at(-1).t1});
    nextOffset+=source.durationSec;
  }
  return {schemaVersion:1,kind:'atlas-conference-source-segments',eventId:EVENT.id,synthetic:false,
    provenance:{generator,files,textPolicy:'Exact SRT text payload, including spaces and internal line endings; no splitting, joining, correction, deduplication, sorting, or overlap repair.'},segments};
}

function rangeFor(toc,speaker,deckId){
  const index=toc.findIndex(row=>row.level===1&&(row.title===speaker||row.title.includes(' · '+speaker+' · 강연 시작')));
  assert.ok(index>=0,'Missing lecture bookmark: '+deckId+' '+speaker);
  let end=null;
  for(let i=index+1;i<toc.length&&toc[i].level>1;i++)if(toc[i].title.includes('강연 끝'))end=toc[i].page;
  assert.ok(Number.isSafeInteger(end),'Missing end bookmark: '+deckId+' '+speaker);
  return [toc[index].page,end];
}

export function deriveLectureRanges({inputs,lock,pageTexts,programs}){
  assert.equal(inputs.schema,'atlas.wp-a.deck-inputs/1');assert.equal(lock.schema,'atlas.wp-a.deck-lock/1');
  const decks=lock.decks.map(deck=>{
    const source=inputs.sources[deck.id],pages=pageTexts[deck.id];
    assert.ok(source&&pages,'Missing locked deck extraction: '+deck.id);
    assert.equal(source.pdf.sha256,deck.pdf.sha256,'Locked PDF identity changed: '+deck.id);
    assert.equal(source.pdf.pages,deck.pdf.pages,'Locked PDF page count changed: '+deck.id);
    if(source.pptx)assert.equal(source.pptx.sha256,deck.pptx.sha256,'Locked PPTX identity changed: '+deck.id);
    assert.equal(pages.schema,'atlas.wp-a.deck-pages/1');assert.equal(pages.deck,deck.id);
    assert.equal(pages.pages.length,deck.pdf.pages,'Extracted page count differs from lock: '+deck.id);
    pages.pages.forEach((page,i)=>{assert.equal(page.page,i+1,'Page text must be complete and ordered');assert.equal(typeof page.text,'string','Page text missing');});
    const toc=inputs.bookmarks[deck.id]?.toc;assert.ok(Array.isArray(toc),'Missing bookmarks: '+deck.id);
    assert.equal(toc.length,inputs.bookmarks[deck.id].count,'Bookmark count differs');
    return {id:deck.id,label:deck.label,pages:deck.pdf.pages,dir:deck.id==='final-290'?'pages/final':'pages/r17',imagesAvailable:false};
  });
  assert.deepEqual(decks.map(deck=>deck.id),['final-290','r17-clean-257'],'Only the two locked decks are allowed');
  const ranges=Object.fromEntries(programs.map(program=>[program.id,Object.fromEntries(decks.map(deck=>[deck.id,
    program.kind==='lecture'?rangeFor(inputs.bookmarks[deck.id].toc,program.speaker,deck.id):null]))]));
  for(const deck of decks){
    let previous=0;
    for(const program of programs.filter(item=>item.kind==='lecture')){
      const [start,end]=ranges[program.id][deck.id];
      assert.ok(Number.isSafeInteger(start)&&start>previous&&end>=start&&end<=deck.pages,'Overlapping/out-of-range lecture bookmarks: '+program.id+' '+deck.id);
      previous=end;
    }
  }
  return {decks,ranges};
}

export function validatePrograms(boundaries,inventory){
  assert.equal(boundaries.schemaVersion,1);assert.equal(boundaries.eventId,EVENT.id);
  const programs=boundaries.programs;
  assert.ok(Array.isArray(programs));
  assert.deepEqual(programs.map(item=>item.id),Array.from({length:15},(_,i)=>String(i).padStart(2,'0')),'00..14 means 15 distinct program slots; none may be silently dropped');
  assert.deepEqual(Object.fromEntries(['opening','lecture','break','closing'].map(kind=>[kind,programs.filter(item=>item.kind===kind).length])),
    {opening:1,lecture:11,break:2,closing:1},'Program composition differs');
  const rows=new Map(inventory.segments.map(row=>[row.source,row]));
  let end=0;
  for(const program of programs){
    assert.equal(program.t0,end,'Program intervals must cover the event continuously');
    assert.ok(Number.isFinite(program.t1)&&program.t1>program.t0,'Invalid program boundary');end=program.t1;
    assert.ok(typeof program.title==='string'&&program.title.length>0,'Program title missing');
    if(program.kind==='lecture')assert.ok(typeof program.speaker==='string'&&program.speaker.length>0,'Lecture speaker missing');
    const evidence=program.boundaryEvidence;
    assert.ok(evidence?.start&&evidence?.end,'Program boundary evidence missing: '+program.id);
    // Explicit source references must resolve to the preserved inventory. The
    // audit may include context arrays and non-source scheduled evidence too.
    const visit=value=>{
      if(!value||typeof value!=='object')return;
      if(typeof value.source==='string'&&/^plaud-[12]#/.test(value.source)){
        const row=rows.get(value.source);assert.ok(row,'Boundary evidence source missing: '+value.source);
        if(own(value,'text'))assert.equal(value.text,row.text,'Boundary evidence changed original text: '+value.source);
        if(own(value,'rawText'))assert.equal(value.rawText,row.text,'Boundary evidence changed original rawText: '+value.source);
      }
      for(const child of Object.values(value))visit(child);
    };visit(evidence);
  }
  assert.equal(end,inventory.provenance.files.reduce((sum,file)=>sum+file.durationSec,0),'Program end differs from declared audio duration');
  return programs;
}

export function validatePageQuarantine(boundaries,pageTexts){
  const exclusions=boundaries.excludedFromAutomaticMapping||{};
  const conflicts=boundaries.pageOwnershipConflicts||[];
  const result={};
  for(const [deck,pages]of Object.entries(pageTexts)){
    const list=exclusions[deck]||[];
    assert.ok(Array.isArray(list)&&new Set(list).size===list.length,'Invalid page quarantine: '+deck);
    for(const page of list)assert.ok(Number.isSafeInteger(page)&&page>=1&&page<=pages.pages.length,'Quarantine page outside locked deck');
    const evidence=conflicts.filter(conflict=>conflict.deck===deck&&conflict.excludedFromAutomaticMapping===true);
    assert.deepEqual([...list].sort((a,b)=>a-b),evidence.map(conflict=>conflict.page).sort((a,b)=>a-b),'Every quarantined page requires explicit source evidence');
    for(const conflict of evidence){
      assert.equal(conflict.evidence?.page,conflict.page,'Quarantine evidence page differs');
      assert.equal(conflict.evidence?.textExact,pages.pages[conflict.page-1].text,'Quarantine evidence changed supplied page text');
      if(conflict.evidence.comparisonSource){
        const other=Object.keys(pageTexts).find(id=>conflict.evidence.comparisonSource.includes('deck-pages-'+id+'.json'));
        assert.ok(other,'Unknown comparison text source');
        assert.equal(conflict.evidence.comparisonTextExact,pageTexts[other].pages[conflict.evidence.comparisonPage-1]?.text,'Quarantine comparison changed supplied text');
      }
    }
    result[deck]=list;
  }
  for(const deck of Object.keys(exclusions))assert.ok(own(pageTexts,deck),'Unknown quarantine deck');
  return result;
}

const STOP_WORDS=new Set(('그리고 그래서 그러니까 그런데 그러면 그러면은 그렇죠 그렇습니다 그렇고 그렇게 그러한 이러한 저희 제가 저는 우리는 여러분 여러분들 지금 이제 오늘 이번 그냥 조금 좀 약간 사실 어떤 이렇게 이렇게요 저렇게 그거 이거 그게 이게 여기 저기 있어요 있습니다 있었어요 없어요 없습니다 하는 하고 하면 합니다 하는데 해요 하세요 되는 됩니다 우리가 이건 그건 또는 대한 통해 관련 경우 이야기 말씀 번째 하나').split(' '));
export function textFeatures(text){
  const result=new Set();
  for(const word of text.normalize('NFKC').toLowerCase().match(/[가-힣]+|[a-z][a-z0-9]*|\d+(?:\.\d+)?/g)||[]){
    if(word.length<2||STOP_WORDS.has(word)||/^\d{1,2}$/.test(word))continue;
    result.add('w:'+word);
    if(/^[가-힣]+$/.test(word)&&word.length>=3)for(let i=0;i<=word.length-3;i++)result.add('g:'+word.slice(i,i+3));
  }
  return result;
}
export function createPageModel(pages,policy=POLICY){
  const records=pages.map(page=>({page:page.page,features:textFeatures(page.text)})),frequency=new Map();
  for(const record of records)for(const feature of record.features)frequency.set(feature,(frequency.get(feature)||0)+1);
  const excluded=new Set([...frequency].filter(([,n])=>records.length>3&&n/records.length>policy.commonFeatureFraction).map(([feature])=>feature));
  const weight=feature=>{const idf=1+Math.log((records.length+1)/((frequency.get(feature)||0)+1));return idf*idf;};
  for(const record of records){record.features=new Set([...record.features].filter(feature=>!excluded.has(feature)));record.mass=[...record.features].reduce((sum,feature)=>sum+weight(feature),0);}
  return {records,excluded,weight,vocabulary:new Set(records.flatMap(record=>[...record.features]))};
}
export function scorePageCandidates(contextText,sourceText,model,policy=POLICY){
  const rawQuery=new Set([...textFeatures(contextText)].filter(feature=>!model.excluded.has(feature)));
  const query=new Set([...rawQuery].filter(feature=>model.vocabulary.has(feature)));
  const direct=new Set([...textFeatures(sourceText)].filter(feature=>!model.excluded.has(feature)));
  const queryMass=[...query].reduce((sum,feature)=>sum+model.weight(feature),0);
  return model.records.map(record=>{
    const shared=[...query].filter(feature=>record.features.has(feature));
    const intersection=shared.reduce((sum,feature)=>sum+model.weight(feature),0);
    const queryCoverage=queryMass?intersection/queryMass:0,cosine=queryMass&&record.mass?intersection/Math.sqrt(queryMass*record.mass):0;
    const directShared=[...direct].filter(feature=>record.features.has(feature));
    return {page:record.page,score:policy.coverageWeight*queryCoverage+policy.cosineWeight*cosine,queryCoverage,cosine,
      sharedFeatures:shared,sharedLexicalWords:shared.filter(feature=>feature.startsWith('w:')).map(feature=>feature.slice(2)),directSharedFeatures:directShared,
      knownFeatureFraction:rawQuery.size?query.size/rawQuery.size:0,knownFeatureCount:query.size,rawFeatureCount:rawQuery.size};
  }).sort((a,b)=>b.score-a.score||a.page-b.page);
}

/** Select eligible rows without ever assigning a backward page or filling nulls. */
export function monotoneCandidates(candidates,range){
  const best=Array(range[1]-range[0]+1).fill(null);
  for(const candidate of candidates){
    assert.ok(candidate.page>=range[0]&&candidate.page<=range[1],'Candidate outside lecture page range');
    let prior=null;
    for(let i=0;i<=candidate.page-range[0];i++)if(best[i]&&(!prior||best[i].weight>prior.weight))prior=best[i];
    const node={candidate,previous:prior,weight:(prior?.weight||0)+candidate.score};
    const at=candidate.page-range[0];if(!best[at]||node.weight>best[at].weight)best[at]=node;
  }
  let tail=null;for(const node of best)if(node&&(!tail||node.weight>tail.weight))tail=node;
  const chosen=new Map();while(tail){chosen.set(tail.candidate.index,tail.candidate);tail=tail.previous;}
  return chosen;
}

function eligibleSource(row,program,policy){
  if(program.kind!=='lecture')return 'non-lecture';
  if(row.t1-row.t0>policy.maxSegmentSeconds)return 'long-source-segment';
  if(row.t0<program.t0||row.t1>program.t1)return 'program-boundary-straddling';
  return null;
}
export function mapLectureRows(rows,program,pages,range,policy=POLICY,excludedPages=[]){
  const excluded=new Set(excludedPages);
  const model=createPageModel(pages.filter(page=>page.page>=range[0]&&page.page<=range[1]&&!excluded.has(page.page)),policy);
  const decisions=rows.map(row=>({source:row.source,page:null,reason:eligibleSource(row,program,policy),candidate:null})),eligible=[];
  let left=0;
  for(let index=0;index<rows.length;index++){
    const row=rows[index],decision=decisions[index];if(decision.reason)continue;
    while(left<index&&rows[left].t0<row.t0-policy.contextSeconds)left++;
    // Use only current/past captions. A future title must not move the slide
    // while the preserved current row is still discussing the preceding page.
    const context=rows.slice(left,index+1).filter(value=>!eligibleSource(value,program,policy));
    const candidates=scorePageCandidates(context.map(value=>value.text).join('\n'),row.text,model,policy);
    const top=candidates[0],second=candidates[1];
    decision.candidate=top?{page:top.page,score:rounded(top.score),runnerUpScore:rounded(second?.score||0),margin:rounded(top.score-(second?.score||0)),
      queryCoverage:rounded(top.queryCoverage),cosine:rounded(top.cosine),sharedFeatures:top.sharedFeatures,sharedLexicalWords:top.sharedLexicalWords,
      knownFeatureFraction:rounded(top.knownFeatureFraction),knownFeatureCount:top.knownFeatureCount,rawFeatureCount:top.rawFeatureCount,
      directSharedFeatures:top.directSharedFeatures,contextSources:[context[0]?.source,context.at(-1)?.source]}:null;
    if(!top||top.score<policy.minimumScore||top.queryCoverage<policy.minimumQueryCoverage)decision.reason='below-confidence-threshold';
    else if(top.sharedFeatures.length<policy.minimumSharedFeatures)decision.reason='insufficient-distinctive-features';
    else if(top.sharedLexicalWords.length<policy.minimumSharedLexicalWords)decision.reason='insufficient-independent-lexical-words';
    else if(top.directSharedFeatures.length<policy.minimumDirectSharedFeatures)decision.reason='no-direct-source-evidence';
    else if(top.score-(second?.score||0)<policy.minimumMargin)decision.reason='ambiguous-page-candidates';
    else{decision.reason='monotonic-conflict';eligible.push({index,page:top.page,score:top.score});}
  }
  for(const [index,candidate]of monotoneCandidates(eligible,range)){decisions[index].page=candidate.page;decisions[index].reason='mapped-draft';}
  return decisions;
}

function nullIntervals(rows,decisions,program,deckId){
  const intervals=[];let current=null;
  rows.forEach((row,i)=>{
    const decision=decisions[i];
    if(decision.page!==null){current=null;return;}
    if(!current){current={program:program.id,title:program.title,deck:deckId,t0:row.t0,t1:row.t1,segmentCount:0,firstSource:row.source,lastSource:row.source,reasons:{}};intervals.push(current);}
    current.t1=Math.max(current.t1,row.t1);current.segmentCount++;current.lastSource=row.source;
    current.reasons[decision.reason]=(current.reasons[decision.reason]||0)+1;
  });
  return intervals;
}

export function buildTimeline({inventory,inputs,lock,pageTexts,boundaries,policy=POLICY}){
  const programs=validatePrograms(boundaries,inventory),{decks,ranges}=deriveLectureRanges({inputs,lock,pageTexts,programs});
  const quarantine=validatePageQuarantine(boundaries,pageTexts);
  const groups=new Map(programs.map(program=>[program.id,[]]));let at=0;
  for(const row of inventory.segments){while(at+1<programs.length&&row.t0>=programs[at].t1)at++;assert.ok(row.t0>=programs[at].t0&&row.t0<programs[at].t1,'Source outside program intervals');groups.get(programs[at].id).push(row);}
  const mapping=new Map(),programQuality=[],nulls=[],evidence=Object.fromEntries(decks.map(deck=>[deck.id,[]])),anchors=[];
  for(const program of programs){
    const rows=groups.get(program.id),decisions={};
    for(const deck of decks){
      decisions[deck.id]=program.kind==='lecture'?mapLectureRows(rows,program,pageTexts[deck.id].pages,ranges[program.id][deck.id],policy,quarantine[deck.id]):rows.map(row=>({source:row.source,page:null,reason:'non-lecture',candidate:null}));
      nulls.push(...nullIntervals(rows,decisions[deck.id],program,deck.id));
      const pageAnchors=new Map();
      decisions[deck.id].forEach((decision,i)=>{
        if(decision.page===null)return;
        const proof={source:decision.source,program:program.id,page:decision.page,...decision.candidate};evidence[deck.id].push(proof);
        const old=pageAnchors.get(decision.page);
        if(!old||proof.score>old.score)pageAnchors.set(decision.page,{deck:deck.id,...proof,t0:rows[i].t0,t1:rows[i].t1,text:rows[i].text,
          evidenceKind:'automatic-lexical-candidate',humanReviewed:false});
      });
      anchors.push(...[...pageAnchors.values()].sort((a,b)=>a.page-b.page));
    }
    rows.forEach((row,i)=>{
      const page=Object.fromEntries(decks.map(deck=>[deck.id,decisions[deck.id][i].page]));
      mapping.set(row.source,{talk:program.id,page:Object.values(page).every(value=>value===null)?null:page});
    });
    const perDeck=Object.fromEntries(decks.map(deck=>{const list=decisions[deck.id],mapped=list.filter(item=>item.page!==null).length;
      return [deck.id,{pageRange:ranges[program.id][deck.id],mappedCount:mapped,nullCount:rows.length-mapped,mappingRatePercent:rate(mapped,rows.length),
        reasons:Object.fromEntries([...new Set(list.map(item=>item.reason))].sort().map(reason=>[reason,list.filter(item=>item.reason===reason).length]))}];}));
    programQuality.push({id:program.id,title:program.title,speaker:program.speaker??null,kind:program.kind,t0:program.t0,t1:program.t1,
      segmentCount:rows.length,mappedEitherCount:rows.filter(row=>mapping.get(row.source).page!==null).length,
      mappedBothCount:rows.filter(row=>mapping.get(row.source).page&&decks.every(deck=>mapping.get(row.source).page[deck.id]!==null)).length,
      boundaryEvidence:program.boundaryEvidence,scheduled:program.scheduled??null,perDeck});
  }
  const timeline={schemaVersion:1,event:{...EVENT},audio:inventory.provenance.files.map(file=>({id:file.id,file:'audio/'+file.id+'.m4a',
    clockStart:file.clockStart,durationSec:file.durationSec,available:false})),decks,
    talks:programs.map(program=>({id:program.id,title:program.title,t0:program.t0,t1:program.t1,pageRange:ranges[program.id]})),
    segments:inventory.segments.map(row=>({t0:row.t0,t1:row.t1,text:row.text,source:row.source,...mapping.get(row.source)}))};
  const validation=validateConferenceTimeline(timeline,{sourceSegments:inventory.segments,requireCoverage:true});
  assert.equal(validation.valid,true,JSON.stringify(validation.errors));
  return {timeline,validation,programQuality,nullIntervals:nulls,mappingEvidence:evidence,automaticSlideAnchors:anchors,quarantine};
}

function inputDiscrepancies({readme,inventory,programQuality}){
  const discrepancies=[];
  for(const source of inventory.provenance.files){
    const line=readme.split('\n').find(line=>line.includes(source.file.split('/').at(-1)));
    const documented=Number(line?.match(/([\d,]+)\s*세그먼트/)?.[1]?.replaceAll(',',''));
    if(Number.isFinite(documented)&&documented!==source.segmentCount)discrepancies.push({kind:'documented-source-count',source:source.id,
      documented,actual:source.segmentCount,resolution:'Use every block in the SHA-256-matching SRT; do not invent a missing caption to reach the documented count.'});
  }
  const declared=Number(readme.match(/(\d+)\s*프로그램/)?.[1]);
  if(Number.isFinite(declared)&&declared!==programQuality.length)discrepancies.push({kind:'program-count',documented:declared,actual:programQuality.length,
    resolution:'One opening + eleven lectures + two breaks + one closing = fifteen; preserve all IDs 00..14.'});
  for(const program of programQuality.filter(item=>item.kind==='lecture')){
    const line=readme.split('\n').find(line=>line.startsWith('|')&&line.includes(program.speaker));if(!line)continue;
    const listed=[...line.matchAll(/(\d+)[–-](\d+)/g)].map(match=>[Number(match[1]),Number(match[2])]);
    for(const [i,deck]of ['final-290','r17-clean-257'].entries())if(listed[i]&&JSON.stringify(listed[i])!==JSON.stringify(program.perDeck[deck].pageRange))discrepancies.push({kind:'readme-bookmark-page-range',speaker:program.speaker,deck,
      readme:listed[i],bookmarks:program.perDeck[deck].pageRange,resolution:'Use explicit start/end bookmarks and enforce nonoverlapping lecture ranges; do not copy the README typo.'});
  }
  return discrepancies;
}
function sourceShape(inventory){
  const byAudio=inventory.provenance.files.map(file=>{
    const rows=inventory.segments.filter(row=>row.audioId===file.id);let overlap=0;
    for(let i=1;i<rows.length;i++)if(rows[i].t0<rows[i-1].t1)overlap++;
    return {audioId:file.id,segments:rows.length,adjacentOverlaps:overlap,leadingWhitespace:rows.filter(row=>/^\s/.test(row.text)).length,
      longSegments:rows.filter(row=>row.t1-row.t0>POLICY.maxSegmentSeconds).map(row=>({source:row.source,t0:row.t0,t1:row.t1,durationSec:rounded(row.t1-row.t0),text:row.text}))};
  });
  return {byAudio,warning:'Exact inventory coverage proves preservation of supplied SRT blocks, not complete speech transcription. Original long/overlapping/sparse ASR intervals are preserved and require audio review.'};
}
function clock(seconds){const total=Math.round((12*3600+33*60+seconds)*1000),h=Math.floor(total/3600000),m=Math.floor(total%3600000/60000),s=(total%60000)/1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${s.toFixed(3).padStart(6,'0')}`;}
const cell=value=>String(value??'—').replaceAll('|','\\|').replaceAll('\n',' ');
export function qualityMarkdown(quality){
  const lines=['# P1b 실제 자막·페이지 매핑 초안','',
    '**자동 초안 / 청취 검수 0/10 / 실제 장표·오디오 자산 미포함.** 파일 보존과 매핑 정확도는 별도 판정이다. 이 보고서는 자동 유사도를 정답률로 해석하지 않는다.','',
    `원본 SRT ${quality.coverage.segmentCount.toLocaleString('en-US')}행을 1행씩 보존했다. 누락 ${quality.coverage.coverage.missing.length} · 추가 ${quality.coverage.coverage.unexpected.length} · 중복 ${quality.coverage.coverage.duplicates.length} · 원문·시간 변경 ${quality.coverage.coverage.changed.length}. 마지막 t1=${quality.coverage.lastSegmentT1}s / 선언된 녹음 길이 ${quality.coverage.audioDurationSec}s. 원본의 겹침과 긴 희소 전사는 수정하지 않았다.`,
    '', '## 프로그램별 초안 매핑','',
    '| ID | 프로그램 | 구간 KST | 원본 행 | final-290 매핑/비율 | R17 매핑/비율 | 양쪽 모두 매핑 |','|---|---|---|---:|---:|---:|---:|'];
  for(const p of quality.programs){const a=p.perDeck['final-290'],b=p.perDeck['r17-clean-257'];lines.push(`| ${p.id} | ${cell(p.title)} | ${clock(p.t0)}–${clock(p.t1)} | ${p.segmentCount} | ${a.mappedCount} / ${a.mappingRatePercent??'—'}% | ${b.mappedCount} / ${b.mappingRatePercent??'—'}% | ${p.mappedBothCount} |`);}
  lines.push('','## 임계값·범위·앵커','',
    `- 같은 강연 안에서 현재 행과 직전 ${quality.policy.contextSeconds}초 문맥만 비교한다. 미래 발화는 쓰지 않으며 원본 행은 합치지 않는다. NFKC·소문자 정규화, 단어/한글 3-gram과 강연 내 IDF는 비교에만 쓰며 원문은 변경하지 않는다.`,
    `- 질의를 해당 강연 페이지의 알려진 비공통 어휘에 투영한다. 대화체·ASR 미등록 특징은 점수 분모에서 제외하되 알려진 특징의 비율·수와 원래 특징 수를 각 매핑 근거에 기록한다. 점수 = 질의 특징 가중 겹침 × ${quality.policy.coverageWeight} + 이진 TF-IDF cosine × ${quality.policy.cosineWeight}. 점수 ≥${quality.policy.minimumScore}, 질의 겹침 ≥${quality.policy.minimumQueryCoverage}, 1·2위 차 ≥${quality.policy.minimumMargin}, 공유 특징 ≥${quality.policy.minimumSharedFeatures}, 서로 다른 직접 일치 단어 ≥${quality.policy.minimumSharedLexicalWords}, 현재 행 직접 특징 ≥${quality.policy.minimumDirectSharedFeatures}일 때만 후보가 된다. 하나의 긴 단어에서 나온 여러 n-gram을 여러 독립 근거로 세지 않는다.`,
    `- ${quality.policy.maxSegmentSeconds}초 초과 원본 행, 프로그램 경계를 넘는 행, 비강연은 null이다. 적격 후보 중 최대 가중치 비감소 부분수열을 선택한다. 역행 후보는 null로 남기고 전후 행의 페이지를 전파하지 않는다.`,
    '- 점수는 결정적인 텍스트 근거 지수이며, 정확도 확률이 아니다. 페이지를 띄운 실제 순간이나 ±0.5초 싱크를 보증하지 않는다.',
    '- 두 덱의 PDF 시작/끝 책갈피는 후보 페이지 범위만 제한한다. 첫 페이지의 등장 시각을 강연 시작 시각과 같다고 가정하지 않는다.',
    '- 프로그램 시각 근거는 program-boundaries-20261112.json의 원문 행·예정 시각을 사용한다. 사회자 소개는 프로그램 소속 경계이며 실제 슬라이드 전환 앵커가 아니다.',
    '- 기존 R11 ASR 대조 38지점 파일은 이번 입력 번들에 없다. 사용하거나 검증했다고 주장하지 않는다. 자동 선택 페이지별 대표 후보와 모든 수용 매핑 점수·문맥 source ID는 JSON 보고서에 있다.','',
    '| ID | 강연/프로그램 | 시작 근거 | 끝 근거 | final 범위 | R17 범위 |','|---|---|---|---|---|---|');
  for(const p of quality.programs)lines.push(`| ${p.id} | ${cell(p.title)} | ${cell(p.boundaryEvidence.start.status)} | ${cell(p.boundaryEvidence.end.status)} | ${cell(p.perDeck['final-290'].pageRange?.join('–'))} | ${cell(p.perDeck['r17-clean-257'].pageRange?.join('–'))} |`);
  lines.push('','## 입력 불일치와 보존 결정','');
  for(const discrepancy of quality.discrepancies)lines.push('- `'+cell(JSON.stringify(discrepancy))+'`');
  lines.push('',`- 공급된 OCR과 책갈피의 발표 소유권이 충돌한 final-290 ${quality.quarantine['final-290'].length}개 페이지(${quality.quarantine['final-290'].join(', ')})는 후보에서 제외했다. 원본 PDF를 검사한 판정이 아니며, 원본·책갈피 범위를 수정하지 않았다. 근거 원문·비교 페이지는 JSON의 pageOwnershipConflicts에 보존한다.`);
  lines.push('','## 미매핑 구간','',
    '아래는 각 덱에서 연속으로 null인 **원본 자막 행 묶음**이다. t0–t1 범위에 무음·전사 공백이 포함될 수 있다. 실제 발화가 없다고 해석하지 않는다. 두 덱의 목록은 독립적이다. 개회·휴식·폐회에는 보조 장표를 생성하지 않으며 page:null을 유지한다.','',
    '| 프로그램 | 덱 | KST 범위 | 원본 행 수 | source 범위 | 이유별 행 수 |','|---|---|---|---:|---|---|');
  for(const gap of quality.nullIntervals)lines.push(`| ${gap.program} | ${gap.deck} | ${clock(gap.t0)}–${clock(gap.t1)} | ${gap.segmentCount} | ${gap.firstSource}…${gap.lastSource} | ${cell(Object.entries(gap.reasons).map(([k,v])=>k+':'+v).join(', '))} |`);
  lines.push('','## 용량과 재현','',
    `- timeline.json: ${quality.payload.timeline.bytes.toLocaleString('en-US')} bytes; gzip(level 9) ${quality.payload.timeline.gzipBytes.toLocaleString('en-US')} bytes; Brotli(quality 11) ${quality.payload.timeline.brotliBytes.toLocaleString('en-US')} bytes. 압축 수치는 전송 구현을 보증하지 않는 로컬 계산이다.`,
    '- 라우트·브라우저 로드 예산은 별도 실측 대상이다. 매핑 JSON의 압축 크기만으로 A-9 4G 2.5초 통과를 선언하지 않는다.',
    '- 생성: `node scripts/build-conference-timeline.mjs`',
    '- 동일 바이트 검증: `node scripts/build-conference-timeline.mjs --check`',
    '- 커버리지: `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json`',
    '- 입력·생성기 SHA-256/bytes, 입력 원본의 선언된 잠금 해시, 출력 JSON SHA-256은 mapping-quality-20261112.json에 기록한다.','',
    '## 남은 검수','',
    '- 실제 오디오 청취 0/10. ±0.5초 자막 싱크, 실제 슬라이드 전환 정확도와 장시간 재생은 미검증이다.',
    '- 두 SRT에 누적된 긴 짧은-문장 구간·중첩을 그대로 보존했다. 원음 청취 없이 빠진 발화를 복구하거나 정확한 강연 시작 시각으로 바꾸지 않는다.',
    '- 최종 290쪽 텍스트는 OCR 초안이며 정본이 아니다. 257쪽 PPTX 텍스트도 별도 덱 계보이므로 매핑은 독립 초안이다.',
    '- 547장 WebP 렌더, 오디오 분할·트랜스코딩, 실제 자산을 넣은 수동 매핑 검수는 다음 작업이다.','');
  return Buffer.from(lines.join('\n'));
}

export async function generateArtifacts({root=DEFAULT_ROOT}={}){
  const trackedInputs=[];
  const load=async file=>{const full=resolve(root,file),rel=relative(root,full);assert.ok(rel!=='..'&&!rel.startsWith('..'+sep),'Input escapes repository');
    const bytes=await readFile(full);trackedInputs.push({file,bytes:bytes.length,sha256:hash(bytes)});return bytes;};
  const lock=JSON.parse(await load(LOCK_PATH)),inputs=JSON.parse(await load(INPUT_DIR+'/deck-inputs.json'));
  assert.equal(inputs.lock,LOCK_PATH,'Input lock path differs');
  const readme=(await load(INPUT_DIR+'/README.md')).toString('utf8');
  const boundaries=JSON.parse(await load(BOUNDARIES_PATH));
  const generatorBytes=await readFile(resolve(root,GENERATOR_PATH));
  const generator={file:GENERATOR_PATH,sha256:hash(generatorBytes),bytes:generatorBytes.length,algorithm:POLICY.version};
  const sources=[];for(const [id,source]of Object.entries(inputs.srt))sources.push({id,...source,file:INPUT_DIR+'/'+source.file,bytes:await load(INPUT_DIR+'/'+source.file)});
  const inventory=createSourceInventory(sources,{generator}),pageTexts={};
  for(const [id,source]of Object.entries(inputs.sources)){
    const name=source.ocr?.pageTextFile||source.text?.pageTextFile;assert.ok(name,'Deck page text path missing');
    pageTexts[id]=JSON.parse(await load(INPUT_DIR+'/'+name));
  }
  assert.ok(Array.isArray(boundaries.sourcePins)&&boundaries.sourcePins.length>0,'Boundary source pins missing');
  for(const pin of boundaries.sourcePins){
    const actual=trackedInputs.find(input=>input.file===pin.path);assert.ok(actual,'Boundary pin names an unloaded input: '+pin.path);
    assert.equal(actual.sha256,pin.sha256,'Boundary evidence input changed: '+pin.path);assert.equal(actual.bytes,pin.bytes,'Boundary input size changed: '+pin.path);
  }
  const built=buildTimeline({inventory,inputs,lock,pageTexts,boundaries}),timelineBytes=compact(built.timeline),sourceBytes=compact(inventory);
  const quality={schemaVersion:1,kind:'atlas-conference-mapping-draft',eventId:EVENT.id,synthetic:false,status:'automatic-draft-human-review-required',
    generator,inputFiles:trackedInputs.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0),
    sourceIdentity:{lockedDecks:lock.decks.map(deck=>({id:deck.id,pdfSha256:deck.pdf.sha256,pages:deck.pdf.pages,pptxSha256:deck.pptx.sha256})),
      bundleDeclarationsMatchLock:true,originalPdfPptxRehashedHere:false,note:'This runner verifies supplied extraction declarations against the committed lock; original files on the owner’s Mac are not available here.'},
    policy:POLICY,coverage:built.validation.summary,sourceShape:sourceShape(inventory),
    discrepancies:inputDiscrepancies({readme,inventory,programQuality:built.programQuality}),
    auditedDiscrepancies:boundaries.discrepancies||[],quarantine:built.quarantine,pageOwnershipConflicts:boundaries.pageOwnershipConflicts||[],
    programs:built.programQuality,nullIntervals:built.nullIntervals,mappingEvidence:built.mappingEvidence,automaticSlideAnchors:built.automaticSlideAnchors,
    generatedSlides:{count:0,decision:'No auxiliary image assets in P1b; opening, breaks and closing keep page:null.'},
    humanReview:{listeningChecked:0,listeningRequired:10,slideAccuracyVerified:false,audioSynchronizationVerified:false},
    payload:{timeline:{file:OUTPUT_PATHS.timeline,bytes:timelineBytes.length,sha256:hash(timelineBytes),gzipBytes:gzipSync(timelineBytes,{level:9}).length,
      brotliBytes:brotliCompressSync(timelineBytes,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:11}}).length},
      sources:{file:OUTPUT_PATHS.sources,bytes:sourceBytes.length,sha256:hash(sourceBytes)}}};
  return {inventory,timeline:built.timeline,quality,files:{[OUTPUT_PATHS.sources]:sourceBytes,[OUTPUT_PATHS.timeline]:timelineBytes,
    [OUTPUT_PATHS.quality]:pretty(quality),[OUTPUT_PATHS.markdown]:qualityMarkdown(quality)}};
}

export async function main(args=process.argv.slice(2)){
  let root=DEFAULT_ROOT,outRoot=null,check=false;
  for(let index=0;index<args.length;index++){
    if(args[index]==='--check')check=true;
    else if(['--root','--out-root'].includes(args[index])&&args[index+1]&&!args[index+1].startsWith('--')){
      const key=args[index++];if(key==='--root')root=resolve(args[index]);else outRoot=resolve(args[index]);
    }else throw new TypeError('Usage: node scripts/build-conference-timeline.mjs [--check] [--root REPO] [--out-root DIR]');
  }
  outRoot??=root;
  const result=await generateArtifacts({root});
  for(const [file,bytes]of Object.entries(result.files)){
    const destination=resolve(outRoot,file);
    if(check)assert.deepEqual(await readFile(destination),bytes,'Generated output differs: '+file);
    else{await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);}
  }
  process.stdout.write(JSON.stringify({status:'passed',mode:check?'check':'build',sourceSegments:result.inventory.segments.length,talks:result.timeline.talks.length,
    coverage:result.quality.coverage.coverage,payload:result.quality.payload,discrepancies:result.quality.discrepancies,
    mapping:result.quality.programs.filter(item=>item.kind==='lecture').map(item=>({id:item.id,speaker:item.speaker,segments:item.segmentCount,perDeck:item.perDeck})),
    humanReview:result.quality.humanReview})+'\n');
  return 0;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.exitCode=await main();}catch(error){process.stderr.write((error.stack||String(error))+'\n');process.exitCode=1;}
}
