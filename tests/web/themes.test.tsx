import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {axes,evidenceAvailableAt,normalizeThemeDraft,themeComparison,themePerformance,themeStatus,validateThemeSnapshot,type ThemeJudgment} from '@atlas/domain/themes';
import {themeIdentity} from '../../apps/api/src/theme-repository.js';
import {loadThemes} from '../../apps/web/src/theme-loader.js';
import {readThemePending,persistThemePending,clearThemePending} from '../../apps/web/src/theme-write.js';
import {ThemeChart,initialThemeView} from '../../apps/web/src/components/theme-chart.js';
import {renderToStaticMarkup} from 'react-dom/server';
const fixture=JSON.parse(await readFile(new URL('../../dist/data/themes.json',import.meta.url),'utf8'));
test('themes: true spot identity, complete candles and conservative evidence clocks',()=>{
  const s=validateThemeSnapshot(fixture);assert.equal(s.asset.pair,'@107');assert.equal(s.asset.bars.length,704);assert.deepEqual(s.asset.bars.at(-1),['2026-11-02',87.812,88.918,82.818,84.007,1097214.03]);
  assert.equal(evidenceAvailableAt(s.evidence.find(e=>e.id==='bitwise-etp')!),'2026-04-09T23:59:59.999Z');const docs=s.evidence.find(e=>e.id==='hip3-docs')!;assert.equal(docs.publishedAt,null);assert.equal(evidenceAvailableAt(docs),docs.retrievedAt);
});
test('themes: past decisions cannot use undated current docs or future releases',()=>{
  const s=validateThemeSnapshot(fixture),j=s.judgments[0];const draft={title:'검사',criteria:structuredClone(j.criteria)};draft.criteria.continuity.evidenceIds=['hip3-docs'];assert.throws(()=>normalizeThemeDraft(draft,s.evidence,j.asOf),/이후/);
  draft.criteria.continuity.evidenceIds=['sdk-0240'];assert.throws(()=>normalizeThemeDraft(draft,s.evidence,j.asOf),/이후/);
  draft.criteria.continuity.evidenceIds=['not-a-source'];assert.throws(()=>normalizeThemeDraft(draft,s.evidence,j.asOf));
});
test('themes: next entire day close, no pre-entry low, missing benchmark and immature outcomes',()=>{
  const s=validateThemeSnapshot(fixture),j=s.judgments[0],p=themePerformance(s,j);assert.equal(p[0].entryDate,'2026-04-10');assert.equal(p[0].exitDate,'2026-04-11');
  const copy=structuredClone(s);copy.asset.bars.find(b=>b[0]==='2026-04-10')![3]=.01;assert.deepEqual(themePerformance(copy,j),p,'entry-day low occurred before reference close');
  copy.asset.bars.at(-1)![4]*=1.01;assert.deepEqual(themePerformance(copy,j),p,'future observations cannot alter completed earlier windows');
  const gap=structuredClone(s);gap.benchmark.bars=gap.benchmark.bars.filter(b=>b[0]!=='2026-04-12');const g=themePerformance(gap,j);assert.equal(g[1].status,'observed');assert.equal(g[1].excess,null);gap.asset.bars=gap.asset.bars.filter(b=>b[0]!=='2026-04-12');assert.equal(themePerformance(gap,j)[1].status,'unavailable');
  assert(themePerformance(s,s.judgments[2]).every(p=>p.status==='pending'&&p.change===null));
});
test('themes: separate reconstructed/recorded groups and empty denominators',()=>{
  const s=validateThemeSnapshot(fixture),groups=themeComparison(s,s.judgments);assert.equal(groups.length,18);
  assert.equal(groups.find(g=>g.mode==='reconstructed'&&g.status==='hold'&&g.horizon===20)!.n,2);
  const pass=groups.find(g=>g.mode==='recorded'&&g.status==='pass'&&g.horizon===1)!;assert.equal(pass.n,0);assert.equal(pass.mean,null);
  const hold=groups.find(g=>g.mode==='recorded'&&g.status==='hold'&&g.horizon===1)!;assert.equal(hold.pending,1);assert.equal(hold.mean,null);
  const j=structuredClone(s.judgments[2]);for(const a of axes)j.criteria[a].state='pass';assert.equal(themeStatus(j),'pass');j.criteria.novelty.state='fail';assert.equal(themeStatus(j),'fail');
});
test('themes: malformed prices and source URLs, time-travel and repeated IDs reject',()=>{
  for(const change of [(d:any)=>d.asset.bars.push(d.asset.bars.at(-1)),(d:any)=>d.asset.bars[0][3]=-1,(d:any)=>d.asset.pair='BTC',(d:any)=>d.evidence[0].url='javascript:alert(1)',(d:any)=>d.judgments[2].recordedAt='2026-01-01T00:00:00Z']){const s=structuredClone(fixture);change(s);assert.throws(()=>validateThemeSnapshot(s));}
});
test('themes: API calculation/integrity checks, saved fallback and no fallback after abort',async()=>{
  const s=validateThemeSnapshot(fixture),{revision}=themeIdentity(s),body={schemaVersion:1,revision,snapshot:s,judgments:s.judgments,comparison:themeComparison(s,s.judgments),performance:s.judgments.map(j=>({id:j.id,result:themePerformance(s,j)}))};
  const json=(d:unknown,status=200)=>new Response(JSON.stringify(d),{status}),abort=new AbortController();
  assert.equal((await loadThemes(abort.signal,async()=>json(body))).kind,'api');
  const bad={...body,performance:[]};const calls:string[]=[];const saved=await loadThemes(abort.signal,async url=>{calls.push(String(url));return json(String(url).startsWith('/api')?bad:s);});assert.equal(saved.kind,'saved');assert.deepEqual(calls,['/api/v1/themes','/data/themes.json']);
  await assert.rejects(loadThemes(abort.signal,async()=>json({},503)));abort.abort();let count=0;await assert.rejects(loadThemes(abort.signal,async()=>{count++;throw abort.signal.reason;}));assert.equal(count,1);
});
test('themes: uncertain writes survive reload with the same request ID, storage failure sends nothing',()=>{
  const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const pending={requestId:'91dc6cc8-3f40-4d65-b37f-3564281fe5e4',revision:themeIdentity(fixture).revision,draft:{title:'검사',criteria:fixture.judgments[2].criteria}};
  persistThemePending(storage,pending);assert.deepEqual(readThemePending(storage),pending);clearThemePending(storage);assert.equal(readThemePending(storage),null);
  assert.throws(()=>persistThemePending({...storage,setItem:()=>{throw new Error('quota');}},pending),/quota/);assert.equal(readThemePending({...storage,getItem:()=>'{broken'}),null);
});
test('themes: responsive chart renders factual bars and groups same-day sources without inventing prices',()=>{
  const s=validateThemeSnapshot(fixture),noop=()=>{};
  const html=renderToStaticMarkup(<ThemeChart bars={s.asset.bars} evidence={s.evidence} judgments={s.judgments} view={initialThemeView(s.asset.bars)} onView={noop} onEvidence={noop} onJudgment={noop} selectedEvidence="hip3-docs" selectedJudgment="initial-review" active/>);
  assert.match(html,/HYPE 현물 가격/);assert.match(html,/근거 2건 2026-11-03/);assert.match(html,/84\.007/);assert.doesNotMatch(html,/NaN|Infinity/);
});
test('themes: recovery cannot silently substitute a newer snapshot for the pending revision',async()=>{
  const abort=new AbortController();await assert.rejects(loadThemes(abort.signal,async url=>new Response(JSON.stringify(String(url).startsWith('/api')?{}:fixture),{status:String(url).startsWith('/api')?404:200}),'0'.repeat(64)),/revision mismatch/);
});
