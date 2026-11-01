from pathlib import Path
import subprocess, re

BASE='9919b71a1e41db8d94bd510d70239467c476a61b'
CANDIDATE='709da73c042625c8c4a84373818e0bf52703b940'
MAIN='20dbfd73e53905c10e50b5e9524da12a979cc22b'
def show(ref,path): return subprocess.check_output(['git','show',ref+':'+path]).decode()
def normalized(s):
    for v in ['1.29.9','1.29.10','1.30.0','1.30.1']: s=s.replace(v,'VERSION')
    return s
assert subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==MAIN
# The date controller and its existing UI suite have no intervening functional edits.
for path in ['dist/chart-replay.js','tests/replay-fixed-forecast-ui.test.mjs']:
    assert normalized(show(BASE,path))==normalized(show(MAIN,path)),path+' changed outside the reviewed date fix'
for path in ['dist/chart-replay.js','tests/replay-fixed-forecast-ui.test.mjs','tests/replay-date-input.test.mjs','scripts/verify-replay-date-browser.mjs','docs/REPLAY_DATE_VALIDATION.md']:
    p=Path(path);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(show(CANDIDATE,path).replace('1.29.10','1.30.1'))
# Keep the concurrently merged IPO view; never downgrade the package or public imports.
for p in [*Path('dist').glob('*.js'),Path('dist/index.html'),Path('package.json')]:
    text=p.read_text()
    if '1.30.0' in text:p.write_text(text.replace('1.30.0','1.30.1'))

def replace(path,old,new):
    p=Path(path);s=p.read_text();assert s.count(old)==1,(path,old);p.write_text(s.replace(old,new))
# Preserve the native assertions, but derive observed membership from the exact input
# archive rather than assuming that BTC still ends on October 25.
replace('scripts/verify-forecast-replay-browser.mjs',
"  await click(cdp,control('next'));\n  const first=await snapshot('recorded-next');assert.equal(first.index,1);assert.equal(first.cursor,nextDate(initial.cursor));assert.equal(first.actualCount,btc?0:1);assert.equal(first.outputHash,initial.outputHash);",
"  const expectedObservedDates=cursor=>[...stored.keys()].filter(date=>date>initial.cursor&&date<=cursor&&observed.has(date)).sort();\n  await click(cdp,control('next'));\n  const first=await snapshot('recorded-next');assert.equal(first.index,1);assert.equal(first.cursor,nextDate(initial.cursor));assert.equal(first.actualCount,expectedObservedDates(first.cursor).length);assert.equal(first.outputHash,initial.outputHash);\n  const firstActual=await exported('recorded-next');assert.deepEqual(firstActual.frame.actual.map(row=>row.date),expectedObservedDates(first.cursor));")
replace('scripts/verify-forecast-replay-browser.mjs',
"  assert.equal(last.index,last.lastIndex);assert.equal(last.actualCount,btc?0:2);assert.ok(last.targets.every(row=>row.at(-1)==='미도래 · 대기'));",
"  assert.equal(last.index,last.lastIndex);assert.equal(last.actualCount,expectedObservedDates(last.cursor).length);assert.ok(last.targets.every(row=>row.at(-1)==='미도래 · 대기'));\n  const lastActual=await exported('recorded-latest');assert.deepEqual(lastActual.frame.actual.map(row=>row.date),expectedObservedDates(last.cursor));")
# End now reaches a later week after the real archive refresh. Explicitly visit
# the first week's Sunday, keeping the seven-day complete-week assertion intact.
replace('scripts/verify-chart-replay-browser.mjs',
"    await click(cdp, control('scrub')); await key('End', 'End', 35);\n    const completed = await snapshot('weekly-completed-sunday');",
"    const sunday=dateFromDay(day(candle1.periodStart)+6);\n    assert.ok(btcCandles.some(row=>row.date===sunday),'The completed first-week Sunday must be present in the actual archive');\n    await click(cdp, control('scrub')); await key('Home', 'Home', 36);\n    for(let i=0;i<day(sunday)-day(direct.origin);i++)await key('ArrowRight','ArrowRight',39);\n    const completed = await snapshot('weekly-completed-sunday');assert.equal(completed.cursor,sunday);")
# Add the user's exact daily-session case to the independent native acceptance.
p=Path('scripts/verify-replay-date-browser.mjs');s=p.read_text()
needle=" const bounds=await evaluate(cdp,()=>{const n=document.querySelector('[data-cr=\"date\"]');return {min:n.min,max:n.max};});"
assert s.count(needle)==1
extra=''' await check('confirmed-daily-26-preserves-future-assumptions',async()=>{
  await click(cdp,'[data-lab-frequency="daily"]');await until(async()=>(await snap()).frequency==='daily','daily interval');await settled(cdp);
  await selectDate('2026-10-26');const before=await snap();assert.equal(before.cursor,'2026-10-25');
  const future=()=>evaluate(cdp,()=>{const s=document.querySelector('#lab-chart');return {
   markers:[...s.querySelectorAll('[data-cycle-marker]')].filter(n=>n.dataset.date>'2026-10-26').map(n=>({id:n.dataset.cycleMarker,date:n.dataset.date,type:n.dataset.milestoneType,label:n.getAttribute('aria-label')})),
   periods:[...s.querySelectorAll('[data-cycle-interval]')].filter(n=>n.dataset.endDate>'2026-10-26').map(n=>({id:n.dataset.cycleInterval,start:n.dataset.startDate,end:n.dataset.endDate,days:n.dataset.days})),
   mode:document.querySelector('[data-cr="mode"]').value,
   disclosure:document.querySelector('[data-cr="evaluation-meaning"]').textContent};});
  const annotations=await future();assert.equal(annotations.mode,'atlas-chart');assert.ok(annotations.markers.some(n=>n.type==='mid-top'||n.label?.includes('MID-TOP')));assert.ok(annotations.periods.length>0);assert.match(annotations.disclosure,/발행한 예측 성적으로 평가하지 않습니다/);
  await key('ArrowRight','ArrowRight',39,8);await until(async()=>(await snap()).cursor==='2026-10-26','user-confirmed October 26');const after=await snap();
  assert.equal(after.signature,before.signature);assert.equal(after.snapshot,before.snapshot);assert.ok(after.band&&after.path&&after.foreground);assert.deepEqual(await future(),annotations);
  const c=after.candles.at(-1),source=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars.find(n=>n.date==='2026-10-26');assert.ok(source);
  for(const name of ['open','high','low','close'])assert.equal(+c[name],source[name]);
  assert.deepEqual(['open','high','low','close'].map(k=>+c[k]),[80047.79,80696.96,79260.02,80005.52]);
  assert.ok(await evaluate(cdp,()=>[...document.querySelectorAll('#lab-chart .observed-candle')].every(n=>n.dataset.date<='2026-10-26')));
  await screenshot(cdp,'confirmed-daily-26-fixed-forecast.png',report);
  await dateView();await segment('year','2099');await click(cdp,'[data-cr="start"]');assert.deepEqual(invariants(await snap()),invariants(after));assert.deepEqual(await future(),annotations);await closeDate();
  return {before:invariants(before),after:invariants(after),ohlc:c,future:annotations};
 });
'''
s=s.replace(needle,extra+needle);p.write_text(s)
# All calculation, renderer, provenance, data, CSS and IPO code is otherwise identical.
changed=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines()
functional={'dist/chart-replay.js','tests/replay-fixed-forecast-ui.test.mjs','scripts/verify-forecast-replay-browser.mjs','scripts/verify-chart-replay-browser.mjs'}
for path in changed:
    if path in functional:continue
    assert normalized(show(MAIN,path))==normalized(Path(path).read_text()),'unreviewed change: '+path
for path in ['dist/atlas-price-chart.js','dist/chart-replay-snapshot.js','dist/chart-replay-renderer.js','dist/chart-replay.css','dist/long-horizon-forecast.js','dist/cycle-milestones-view.js','dist/cycle-interval-overlay.js','dist/data/btc-volume.json']:
    assert show(MAIN,path)==Path(path).read_text(),'must remain byte identical: '+path
