from pathlib import Path
import hashlib,sys
src=Path(sys.argv[1]).read_text()
assert hashlib.sha256(src.encode()).hexdigest()=='0770318fc0e1962ba2e162d33fdbb7555bd181271e08378eaa9f7a797bd26cc6'
src=src.replace('1.29.7','1.29.8')
src=src.replace("'chart-replay.js','chart-replay-atlas.js'","'chart-replay.js','chart-replay-snapshot.js','chart-replay-atlas.js'")
src=src.replace('above:f?', 'below:f?').replace('(n.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING)', '(f.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING)').replace('s.above,true','s.below,true')
anchor=" assert.equal(report.runtimeErrors.length,0);report.status='pass';"
assert src.count(anchor)==1
extra=r'''
 // Persist through the visible exit dialog; no direct storage writes or state setters.
 await click(cdp,'[data-cr="select-menu"]');
 const savedFrame=await read('before-explicit-save');
 const captureHash=savedFrame.data.replaySnapshotHash,capturedAt=savedFrame.data.replaySnapshotCapturedAt;
 assert.match(captureHash,/^[a-f0-9]{64}$/);assert.ok(capturedAt);
 await click(cdp,'[data-cr="exit"]');
 assert.equal(await evaluate(cdp,()=>document.querySelector('[data-cr="exit-save"]').checked),true);
 await click(cdp,'[data-cr="exit-confirm"]');
 await until(()=>evaluate(cdp,()=>!document.querySelector('#lab-chart')?.dataset.chartReplayActive),'full snapshot save and exit');
 const saved=await evaluate(cdp,()=>{
   const text=localStorage.getItem('atlas-chart-replay-v1:BTCUSD'),draft=JSON.parse(text);
   return {bytes:new TextEncoder().encode(text).byteLength,origin:draft.origin,cursorDate:draft.cursorDate,
     outputHash:draft.outputHash,capture:draft.forecastSnapshot};
 });
 assert.equal(saved.cursorDate,'2026-08-18');assert.equal(saved.capture.digest,captureHash);
 assert.equal(saved.capture.outputHash,savedFrame.data.replayOutputHash);
 assert.equal(saved.capture.kind,'atlas-replay-snapshot-reference','the full operating capture must use the database, not truncate rows');
 report.saved={bytes:saved.bytes,origin:saved.origin,cursorDate:saved.cursorDate,kind:saved.capture.kind,digest:captureHash,capturedAt};
 const databaseCapture=await evaluate(cdp,async id=>{
   const record=await new Promise((resolve,reject)=>{const opening=indexedDB.open('atlas-fixed-replay',1);
     opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{const db=opening.result,tx=db.transaction('captures','readonly'),get=tx.objectStore('captures').get(id);
       get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};});
   if(!record)return null;
   return {version:record.version,digest:record.digest,decodedBytes:record.decodedBytes,
     encoding:record.encoding,payloadChars:record.payload?.length,capturedAt:record.capturedAt};
 },saved.capture.id);
 assert.equal(databaseCapture.digest,captureHash);assert.equal(databaseCapture.capturedAt,capturedAt);
 assert.equal(databaseCapture.encoding,'gzip-base64');assert.ok(databaseCapture.decodedBytes>8*1024*1024);
 report.databaseCapture=databaseCapture;
 const previousLoads=loads;await cdp.send('Page.reload',{ignoreCache:true});
 await until(()=>loads>previousLoads,'saved-session hard reload');await until(ready,'reloaded live chart');await settled(cdp);
 report.savedSessionReload={ignoreCache:true,loadEvents:loads-previousLoads};
 // A normal URL option changes only the live chart, not the saved replay.
 await cdp.send('Page.navigate',{url:base+'?symbol=BTCUSD&assumption=stress&granularity=weekly&type=candles&view-start=2024-10-29&view-end=2028-10-29'});
 await until(()=>evaluate(cdp,old=>!!document.querySelector('#workbench-replay')&&
   document.querySelector('#lab-scenario')?.value==='stress'&&
   !!document.querySelector('#lab-chart')?.dataset.forecastValueSignature&&
   document.querySelector('#lab-chart').dataset.forecastValueSignature!==old,signature),'changed live assumptions');
 await settled(cdp);const changed=await read('live-assumption-changed');assert.notEqual(changed.data.forecastValueSignature,signature);
 await click(cdp,'#workbench-replay');await until(()=>evaluate(cdp,()=>!document.querySelector('[data-cr="entry-dialog"]').hidden),'Continue choice');
 await click(cdp,'[data-cr="entry-continue"]');
 await until(()=>evaluate(cdp,hash=>document.querySelector('.chart-replay-controls')?.dataset.state==='paused'&&
   document.querySelector('#lab-chart')?.dataset.replaySnapshotHash===hash,captureHash),'full saved curve restored');await settled(cdp);
 const resumed=await read('restored-after-live-model-change');
 assert.equal(resumed.data.forecastValueSignature,signature);assert.equal(resumed.data.replayOutputHash,savedFrame.data.replayOutputHash);
 assert.equal(resumed.data.replaySnapshotCapturedAt,capturedAt);assert.equal(resumed.data.replayCursor,'2026-08-18');
 assert.ok(resumed.path&&resumed.band&&resumed.below);assert.equal(resumed.interval,'daily');
 assert.equal(resumed.data.cycleMarkerCount,savedFrame.data.cycleMarkerCount);assert.equal(resumed.data.cycleIntervalCount,savedFrame.data.cycleIntervalCount);
 await screenshot(cdp,'public-restored-full-forecast.png',report);
 await key('ArrowRight',39);
 await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replayCursor==='2026-08-19'&&
   [...document.querySelectorAll('#lab-chart .observed-candle')].at(-1)?.dataset.date==='2026-08-19'),'restored daily forward');await settled(cdp);
 const next=await read('restored-next-daily-frame'),c=next.candles.at(-1),prefix=rows.filter(r=>r.date>='2026-08-17'&&r.date<='2026-08-19');
 assert.equal(next.data.forecastValueSignature,signature);assert.equal(next.data.replaySnapshotHash,captureHash);
 assert.equal(+c.open,prefix[0].open);assert.equal(+c.high,Math.max(...prefix.map(r=>r.high)));assert.equal(+c.low,Math.min(...prefix.map(r=>r.low)));assert.equal(+c.close,prefix.at(-1).close);assert.equal(+c.daysIncluded,3);
 assert.ok(next.below&&next.path&&next.band);await screenshot(cdp,'public-restored-next-frame.png',report);
 const unchanged=await evaluate(cdp,()=>{const d=JSON.parse(localStorage.getItem('atlas-chart-replay-v1:BTCUSD'));return {cursor:d.cursorDate,digest:d.forecastSnapshot.digest};});
 assert.deepEqual(unchanged,{cursor:'2026-08-18',digest:captureHash});
'''
src=src.replace(anchor,extra+anchor)
Path(sys.argv[2]).write_text(src)
print(hashlib.sha256(src.encode()).hexdigest())
