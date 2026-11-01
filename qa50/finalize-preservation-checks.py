from pathlib import Path
p=Path('scripts/verify-chart-replay-browser.mjs');s=p.read_text();assert s.count('const sunday=dateFromDay(')==1;p.write_text(s.replace('const sunday=dateFromDay(','const sunday=dateAt('))
p=Path('scripts/verify-replay-date-browser.mjs');s=p.read_text();s=s.replace('{readFile,writeFile,mkdir,mkdtemp}','{readFile,writeFile,mkdir,mkdtemp,readdir}')
old="  const c=after.candles.at(-1),source=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars.find(n=>n.date==='2026-10-26');assert.ok(source);"
new='''  // The four-year daily view intentionally batches SVG candles. Read the
  // actual native download rather than narrowing the viewport to inspect it.
  const downloads=await mkdtemp(resolve(out,'daily26-export-'));await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
  await click(cdp,'[data-cr="select-menu"]');await click(cdp,'[data-cr="menu-settings"]');await click(cdp,'[data-cr="details"]');await click(cdp,'[data-cr="export"]');
  let filename;await until(async()=>{filename=(await readdir(downloads)).find(n=>n.endsWith('.json'));return !!filename;},'native daily JSON download');
  const payload=JSON.parse(await readFile(resolve(downloads,filename),'utf8'));await closeDate();
  assert.equal(payload.frame.cursorDate,'2026-10-26');assert.ok(payload.frame.actual.length>0);assert.ok(payload.frame.actual.every(r=>r.date<='2026-10-26'));
  assert.equal(payload.identity.currentChartSnapshot,true);assert.equal(payload.identity.publicationTimeProven,false);assert.equal(payload.identity.issuedAt,null);assert.equal(payload.frame.metrics.independentSampleCount,null);
  const c=payload.frame.actual.at(-1),source=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars.find(n=>n.date==='2026-10-26');assert.ok(source);
  assert.ok(await evaluate(cdp,()=>document.querySelector('#lab-chart .observed-candles-batched')||document.querySelector('#lab-chart .observed-candle')));'''
assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
