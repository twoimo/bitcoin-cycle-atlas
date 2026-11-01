// Issue #50: input validation owns manual selection, never pointer snapping.
for(const submit of ['button','Enter'])test('issue50 invalid manual dates preserve session, capture, range and save via '+submit,async()=>{
  const h=await fixtures({storedText:await seededSave(),actualPainter:true});h.trigger.click();await resumed(h);
  h.controls.get('select-menu').click();h.controls.get('select-date').click();
  const input=h.controls.get('date'),state=h.state(),session=state.session,cursor=state.cursorIndex;
  const saved=h.savedText(),signature=h.svg.dataset.forecastValueSignature,digest=session.replaySnapshot.digest;
  const view=JSON.stringify([h.lastDraw().start,h.lastDraw().end]),calls=h.calls.current;let reports=0,custom='';
  input.setCustomValidity=text=>{custom=text;};input.reportValidity=()=>{reports++;return false;};
  for(const value of ['2099-08-24','1900-08-24','','2026-02-29','2026-02-30','2026-13-01','10000-01-01']){
    input.value=value;input.oninput?.();
    if(submit==='button')h.controls.get('start').click();else input.onkeydown({key:'Enter',preventDefault(){}});
    await flush();assert.equal(h.state().session===session,true,'manual invalid input must not replace the session');assert.equal(h.state().cursorIndex,cursor);
    assert.equal(h.state().session.replaySnapshot.digest,digest);assert.equal(h.svg.dataset.forecastValueSignature,signature);
    assert.equal(h.savedText(),saved);assert.equal(h.writes.length,0);assert.equal(h.calls.current,calls);
    assert.equal(JSON.stringify([h.lastDraw().start,h.lastDraw().end]),view);assert.equal(input.value,value);
    assert.equal(input.getAttribute('aria-invalid'),'true');assert.ok(custom);assert.ok(h.controls.get('date-hint').textContent);
    assert.equal(h.controls.get('select-panel').hidden,false);
  }
  assert.equal(reports,7);h.mounted.destroy();
});
test('issue50 corrected input clears the error and selects the exact day',async()=>{
  const h=await fixtures();await h.open();await h.start('2026-08-17');
  h.controls.get('select-menu').click();h.controls.get('select-date').click();const input=h.controls.get('date');let custom='';
  input.setCustomValidity=text=>{custom=text;};input.checkValidity=()=>!custom;input.reportValidity=()=>false;
  input.value='2099-08-24';h.controls.get('start').click();assert.ok(custom);
  input.value='2026-08-24';input.oninput();assert.equal(custom,'');assert.equal(input.getAttribute('aria-invalid'),'false');
  input.onkeydown({key:'Enter',preventDefault(){}});await until(()=>h.svg.dataset.replayCursor==='2026-08-23','corrected exact date');
  assert.equal(h.state().session.replaySettings.startDate,'2026-08-24');h.mounted.destroy();
});
test('issue50 invalid draft cancel and reopen do not retain custom validity',async()=>{
  const h=await fixtures();await h.open();await h.start('2026-08-17');h.key('ArrowRight');
  h.controls.get('select-menu').click();h.controls.get('select-date').click();const input=h.controls.get('date');let custom='';
  input.setCustomValidity=text=>{custom=text;};input.reportValidity=()=>false;
  input.value='2099-08-24';h.controls.get('start').click();assert.ok(custom);
  h.controls.get('menu-back').click();assert.equal(custom,'');h.controls.get('select-date').click();
  assert.equal(input.value,'2026-08-17');assert.equal(input.getAttribute('aria-invalid'),'false');
  assert.equal(h.svg.dataset.replayCursor,'2026-08-17');assert.equal(h.writes.length,0);h.mounted.destroy();
});
test('issue50 native badInput is also rejected even for a canonical value',async()=>{
  const h=await fixtures();await h.open();await h.start('2026-08-17');const session=h.state().session;
  const input=h.controls.get('date');input.value='2026-08-24';input.checkValidity=()=>false;let reports=0;input.reportValidity=()=>reports++;
  h.controls.get('start').click();await flush();assert.equal(h.state().session===session,true,'manual invalid input must not replace the session');assert.equal(reports,1);assert.equal(h.writes.length,0);h.mounted.destroy();
});
test('issue50 manual min and max remain exact selectable boundary days',async()=>{
  for(const boundary of ['min','max']){
    const h=await fixtures();await h.open();const value=h.controls.get('date')[boundary];await h.start(value);
    assert.equal(h.state().status,'paused');assert.equal(h.state().session.replaySettings.startDate,value);
    assert.equal(h.svg.dataset.replayCursor,new Date(Date.parse(value+'T00:00:00Z')-86400000).toISOString().slice(0,10));
    h.key('ArrowRight');assert.equal(h.svg.dataset.replayCursor,value);h.mounted.destroy();
  }
});

