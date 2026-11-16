import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertConferenceTimeline, validateConferenceTimeline} from '../dist/conference/timeline.js';
import {verifyConferenceTimeline} from '../scripts/verify-conference-timeline.mjs';

const timelineURL = new URL('./fixtures/conference/timeline.synthetic.json', import.meta.url);
const sourcesURL = new URL('./fixtures/conference/sources.synthetic.json', import.meta.url);
const timelineBytes = await readFile(timelineURL);
const sourceBytes = await readFile(sourcesURL);
const original = JSON.parse(timelineBytes), inventory = JSON.parse(sourceBytes);
const fresh = () => structuredClone(original);
const sourceRows = () => structuredClone(inventory.segments);
const codes = result => result.errors.map(error => error.code);
function reject(change, expected) {
  const timeline = fresh(); change(timeline);
  const result = validateConferenceTimeline(timeline, {sourceSegments:inventory.segments,requireCoverage:true});
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes(expected), JSON.stringify(result.errors));
  return result;
}

test('synthetic A-4 timeline proves all 23 source rows and both fictional deck bounds', () => {
  const result = validateConferenceTimeline(original, {sourceSegments:inventory.segments,requireCoverage:true});
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.summary, {
    audioDurationSec:4000,segmentCount:23,talkCount:15,deckCount:2,lastSegmentT1:4000,
    coverage:{checked:true,expectedCount:23,missing:[],unexpected:[],duplicates:[],changed:[]},
  });
  assert.equal(original.synthetic, true);
  assert.deepEqual(original.decks.map(deck => deck.pages), [3,2], 'fixture pages cannot be mistaken for 290/257 production mappings');
});

test('UI structural validation does not certify subtitle completeness without independent sources', () => {
  const result = validateConferenceTimeline(original);
  assert.equal(result.valid, true);
  assert.equal(result.summary.coverage.checked, false);
  assert.equal(result.summary.coverage.expectedCount, null);
  const complete = validateConferenceTimeline(original, {requireCoverage:true});
  assert.equal(complete.valid, false);
  assert.ok(codes(complete).includes('source_inventory_required'));
});

test('removing a middle subtitle fails exact source coverage, even when end time remains valid', () => {
  const result = reject(timeline => timeline.segments.splice(7,1), 'missing_source');
  assert.deepEqual(result.summary.coverage.missing, [original.segments[7].source]);
  assert.equal(result.summary.lastSegmentT1, 4000);
});

test('equal row counts cannot conceal a replaced or invented source subtitle', () => {
  const result = reject(timeline => { timeline.segments[7].source = 'invented#1'; }, 'missing_source');
  assert.equal(result.summary.segmentCount, inventory.segments.length);
  assert.deepEqual(result.summary.coverage.unexpected, ['invented#1']);
});

test('a repeated original source is rejected rather than counted as another retained segment', () => {
  const result = reject(timeline => { timeline.segments[7].source = timeline.segments[6].source; }, 'duplicate_source');
  assert.deepEqual(result.summary.coverage.duplicates, [original.segments[6].source]);
  assert.deepEqual(result.summary.coverage.missing, [original.segments[7].source]);
});

test('subtitle text and event times must exactly preserve the independent source row', () => {
  for (const change of [
    timeline => { timeline.segments[0].text += ' '; },
    timeline => { timeline.segments[0].text = timeline.segments[0].text.replace('가상', '실제'); },
    timeline => { timeline.segments[0].t0 = 0.001; },
    timeline => { timeline.segments[0].t1 -= 0.001; },
  ]) assert.deepEqual(reject(change, 'changed_source').summary.coverage.changed, ['fixture-1#1']);
});

test('independent source inventory must be nonempty, well formed and unique', () => {
  for (const rows of [null,[],{},[null]]) assert.equal(validateConferenceTimeline(original,{sourceSegments:rows,requireCoverage:true}).valid,false);
  const duplicated = sourceRows(); duplicated.push(duplicated[0]);
  assert.ok(codes(validateConferenceTimeline(original,{sourceSegments:duplicated})).includes('source_inventory_duplicate'));
  const malformed = sourceRows(); malformed[0].t1 = Infinity;
  assert.ok(codes(validateConferenceTimeline(original,{sourceSegments:malformed})).includes('source_inventory_row'));
});

test('source audio references are checked when the independent inventory supplies them', () => {
  const rows = sourceRows(); rows[0].audioId = 'unlisted-recording';
  assert.ok(codes(validateConferenceTimeline(original,{sourceSegments:rows})).includes('unknown_audio'));
  delete rows[0].audioId;
  assert.equal(validateConferenceTimeline(original,{sourceSegments:rows}).valid,true);
});

test('every t1 is bounded by audio duration, including an overrun before the final segment', () => {
  reject(timeline => { timeline.segments.at(-1).t1 = 4000.001; }, 'audio_overrun');
  reject(timeline => { timeline.segments[1].t1 = 4001; }, 'audio_overrun');
  reject(timeline => { timeline.talks.at(-1).t1 = 4001; }, 'audio_overrun');
  assert.equal(validateConferenceTimeline(original).valid,true, 'exact final audio boundary is allowed');
});

test('segment time values reject negative, zero-length, nonnumeric and nonfinite intervals', () => {
  for (const pair of [[-1,1],[1,1],[2,1],['0',12],[0,Infinity],[NaN,12]]) {
    reject(timeline => { [timeline.segments[0].t0,timeline.segments[0].t1] = pair; }, 'time_interval');
  }
});

test('chronological source order is enforced without sorting or filling silence gaps', () => {
  reject(timeline => { [timeline.segments[0],timeline.segments[1]]=[timeline.segments[1],timeline.segments[0]]; }, 'segment_order');
  const timeline = fresh(), rows = sourceRows();
  timeline.segments[0].t1 = rows[0].t1 = 10;
  assert.equal(validateConferenceTimeline(timeline,{sourceSegments:rows,requireCoverage:true}).valid,true, 'silent two-second gap is not a missing subtitle');
});

test('each deck has its own 1-based page interval and page values cannot be coerced', () => {
  for (const [deck,page] of [['final-290',0],['final-290',4],['r17-257',3],['r17-257',1.5],['r17-257','1'],['r17-257',Infinity]]) {
    reject(timeline => { timeline.segments[0].page[deck] = page; }, 'page_range');
  }
  reject(timeline => { timeline.segments[0].page.unknown = 1; }, 'unknown_deck');
});

test('page null and per-deck missing maps are explicit valid states, but omitted page is not', () => {
  const timeline = fresh();
  timeline.segments[0].page = null;
  timeline.segments[1].page = {'final-290':null,'r17-257':null};
  timeline.segments[2].page = {'final-290':2};
  assert.equal(validateConferenceTimeline(timeline).valid,true);
  reject(value => { delete value.segments[0].page; }, 'segment_page');
  reject(value => { value.segments[0].page = 1; }, 'segment_page');
});

test('talk page ranges use the corresponding deck bounds and ascending endpoints', () => {
  reject(timeline => { timeline.talks[0].pageRange['r17-257']=[1,3]; }, 'page_range');
  reject(timeline => { timeline.talks[0].pageRange['final-290']=[3,1]; }, 'talk_page_range');
  reject(timeline => { timeline.talks[0].pageRange['final-290']=[1]; }, 'talk_page_range');
  reject(timeline => { timeline.talks[0].pageRange.unknown=null; }, 'unknown_deck');
  const timeline = fresh(); timeline.talks[0].pageRange={'final-290':null,'r17-257':null};
  assert.equal(validateConferenceTimeline(timeline).valid,true);
});

test('audio, deck and talk identities are unique and source talk references must resolve', () => {
  for (const key of ['audio','decks','talks']) reject(timeline => { timeline[key].push(structuredClone(timeline[key][0])); }, 'duplicate_id');
  reject(timeline => { timeline.segments[0].talk='missing-talk'; }, 'unknown_talk');
});

test('talk intervals remain ordered and nonoverlapping', () => {
  reject(timeline => { timeline.talks[1].t0=259; }, 'talk_order');
  reject(timeline => { timeline.talks[0].t0=-1; }, 'time_interval');
});

test('audio clocks form contiguous global playback spans with finite positive durations', () => {
  for (const duration of [0,-1,'3720',NaN,Infinity]) reject(timeline => { timeline.audio[0].durationSec=duration; }, 'audio_duration');
  reject(timeline => { timeline.audio[1].clockStart='13:35:01'; }, 'audio_continuity');
  reject(timeline => { timeline.audio[0].clockStart='12:33:01'; }, 'audio_continuity');
  reject(timeline => { timeline.audio[1].clockStart='25:00:00'; }, 'audio_clock');
  reject(timeline => { timeline.audio[0].durationSec=1e308; timeline.audio[1].durationSec=1e308; }, 'audio_total');
});

test('all A-4 containers and event fields are required and malformed objects fail without throwing', () => {
  for (const value of [null,undefined,[],0,'timeline']) assert.equal(validateConferenceTimeline(value).valid,false);
  for (const key of ['audio','decks','talks','segments']) reject(timeline => { timeline[key]=[]; }, 'nonempty_array');
  reject(timeline => { timeline.schemaVersion=2; }, 'schema_version');
  reject(timeline => { timeline.event=null; }, 'event_object');
  for (const key of ['id','title','date','timezone','clockStart','clockEnd']) reject(timeline => { delete timeline.event[key]; }, 'event_field');
  reject(timeline => { timeline.decks[0].pages=0; }, 'deck_pages');
  reject(timeline => { timeline.decks[0].pages=3.5; }, 'deck_pages');
});

test('event dates, time zones and clock values are validated rather than merely nonempty', () => {
  reject(timeline => { timeline.event.date='2026-02-30'; }, 'event_date');
  reject(timeline => { timeline.event.timezone='not/a-timezone'; }, 'event_timezone');
  reject(timeline => { timeline.event.clockEnd='13:99:00'; }, 'event_clock');
});

test('asset references cannot escape the timeline asset directory', () => {
  for (const value of ['/audio/a.wav','../a.wav','audio/../a.wav','https://example.com/a.wav','audio\\a.wav','audio/%2e%2e/a.wav','audio//a.wav','audio/a.wav?token=x']) {
    reject(timeline => { timeline.audio[0].file=value; }, 'asset_path');
    reject(timeline => { timeline.decks[0].dir=value; }, 'asset_path');
  }
});

test('assertion preserves caller bytes and returns the original object, including Unicode text', () => {
  const timeline = fresh();
  function freeze(value) { if(value && typeof value==='object') {Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
  const before=JSON.stringify(timeline);freeze(timeline);
  assert.equal(assertConferenceTimeline(timeline),timeline);
  assert.equal(JSON.stringify(timeline),before);
  assert.throws(()=>assertConferenceTimeline({}),error=>error instanceof TypeError && error.validation.valid===false && /Invalid conference timeline/.test(error.message));
});

test('CLI verification binds actual source bytes and rejects a source inventory for another event', async t => {
  const result=await verifyConferenceTimeline({timelinePath:fileURLToPath(timelineURL),sourcesPath:fileURLToPath(sourcesURL)});
  assert.equal(result.status,'passed');assert.equal(result.syntheticFixture,true);
  assert.equal(result.timeline.sha256,createHash('sha256').update(timelineBytes).digest('hex'));
  assert.equal(result.sources.sha256,createHash('sha256').update(sourceBytes).digest('hex'));
  const dir=await mkdtemp(join(tmpdir(),'atlas-conference-schema-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const wrong=structuredClone(inventory);wrong.eventId='another-event';
  const file=join(dir,'sources.json');await writeFile(file,JSON.stringify(wrong));
  const rejected=await verifyConferenceTimeline({timelinePath:fileURLToPath(timelineURL),sourcesPath:file});
  assert.equal(rejected.status,'failed');assert.ok(codes(rejected).includes('source_event'));
});

test('CLI exit codes reflect real coverage failures and never overwrite an input with its receipt', async t => {
  const dir=await mkdtemp(join(tmpdir(),'atlas-conference-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const script=fileURLToPath(new URL('../scripts/verify-conference-timeline.mjs',import.meta.url));
  const timelineFile=join(dir,'timeline.json'),sourcesFile=join(dir,'sources.json'),outputFile=join(dir,'receipt.json');
  await writeFile(timelineFile,timelineBytes);await writeFile(sourcesFile,sourceBytes);
  const args=['--timeline',timelineFile,'--sources',sourcesFile];
  const run=extra=>spawnSync(process.execPath,[script,...extra],{encoding:'utf8',maxBuffer:1024*1024});
  const pass=run([...args,'--out',outputFile]);assert.equal(pass.status,0,pass.stderr);
  assert.equal(JSON.parse(pass.stdout).summary.coverage.missing.length,0);
  assert.equal(await readFile(outputFile,'utf8'),pass.stdout);
  const noSources=run(['--timeline',timelineFile]);assert.equal(noSources.status,1);assert.match(noSources.stderr,/--sources/);
  const overwrite=run([...args,'--out',timelineFile]);assert.equal(overwrite.status,1);assert.match(overwrite.stderr,/must not overwrite/);
  assert.deepEqual(await readFile(timelineFile),timelineBytes);
  const missing=fresh();missing.segments.splice(10,1);await writeFile(timelineFile,JSON.stringify(missing));
  const fail=run(args);assert.equal(fail.status,1);assert.equal(JSON.parse(fail.stdout).status,'failed');
  assert.deepEqual(JSON.parse(fail.stdout).summary.coverage.missing,[original.segments[10].source]);
});
