import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {describeBtcRefresh,mountBtcRefreshStatus} from '../dist/btc-refresh-status.js';

const now=new Date('2026-10-27T05:00:00Z');
test('initial valid archive is quiet until a real refresh is attempted',()=>{
  const value=describeBtcRefresh({phase:'idle',asOf:'2026-10-25',now});
  assert.equal(value.visible,false);assert.equal(value.announcement,'');
});
test('provider failure retains a dated visible notice and permits retry',()=>{
  const value=describeBtcRefresh({phase:'failed',asOf:'2026-10-25',now});
  assert.equal(value.visible,true);assert.equal(value.busy,false);
  assert.equal(value.state,'failed');assert.match(value.detail,/2026\.10\.25 UTC 자료 유지/);
  assert.match(value.announcement,/실패/);assert.doesNotMatch(value.announcement,/최신 자료/);
});
test('a retry is busy with the archive cutoff, followed by a persistent failure',()=>{
  const busy=describeBtcRefresh({phase:'refreshing',asOf:'2026-10-25',now});
  assert.equal(busy.busy,true);assert.equal(busy.visible,true);assert.match(busy.detail,/2026\.10\.25/);
  const failed=describeBtcRefresh({phase:'failed',asOf:'2026-10-25',now});
  assert.equal(failed.busy,false);assert.equal(failed.visible,true);assert.equal(failed.state,'failed');
});
test('successful retrieval of an old archive is a provider delay, not current data',()=>{
  for(const phase of ['checked','published']){
    const value=describeBtcRefresh({phase,asOf:'2026-10-25',now});
    assert.equal(value.visible,true);assert.equal(value.state,'delayed');assert.equal(value.stale,true);
    assert.match(value.announcement,/최신 완료일보다 이전 자료/);
  }
});
test('fresh success hides the visual warning but preserves a distinct live announcement',()=>{
  const direct=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now});
  const publication=describeBtcRefresh({phase:'published',asOf:'2026-10-26',now});
  assert.equal(direct.visible,false);assert.equal(publication.visible,false);
  assert.match(direct.announcement,/제공자 확인 완료/);assert.match(publication.announcement,/배포 자료 수신/);
  assert.equal(direct.stale,false);assert.equal(publication.busy,false);
});
test('completed UTC day changes at midnight without a local-time assumption',()=>{
  const before=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now:'2026-10-27T23:59:59Z'});
  const after=describeBtcRefresh({phase:'checked',asOf:'2026-10-26',now:'2026-10-28T00:00:00Z'});
  assert.equal(before.visible,false);assert.equal(after.state,'delayed');assert.equal(after.visible,true);
});
test('unknown cutoffs never become fresh and invalid clocks/phases fail explicitly',()=>{
  for(const asOf of [null,'2026-02-30','not-a-date']){
    const value=describeBtcRefresh({phase:'checked',asOf,now});
    assert.equal(value.visible,true);assert.match(value.detail,/관측일 미확인/);
  }
  assert.throws(()=>describeBtcRefresh({phase:'success',now}),/phase/);
  assert.throws(()=>describeBtcRefresh({phase:'checked',now:'invalid'}),/clock/);
});

test('the existing compare notice reserves its measured height, follows resizing and cleans up its retry owner',()=>{
  const previousResize=Object.getOwnPropertyDescriptor(globalThis,'ResizeObserver');
  const {document,window}=parseHTML('<html><body><main id="main" tabindex="-1"><aside id="btc-refresh-notice" hidden><strong id="btc-refresh-summary"></strong><span id="btc-refresh-detail"></span><button id="btc-refresh-retry">재시도</button></aside></main><span id="btc-refresh-announcement"></span></body></html>');
  const notice=document.getElementById('btc-refresh-notice'),button=document.getElementById('btc-refresh-retry');
  const reserved=()=>document.documentElement.style.getPropertyValue('--btc-compare-notice-height');
  const chartReserved=()=>document.documentElement.style.getPropertyValue('--btc-refresh-height');
  let noticeHeight=53,retries=0,observer,status;
  notice.getBoundingClientRect=()=>({height:noticeHeight});
  window.ResizeObserver=class {
    constructor(callback){this.callback=callback;this.targets=new Set();observer=this;}
    observe(target){this.targets.add(target);}
    disconnect(){this.targets.clear();}
    notify(target){if(this.targets.has(target))this.callback([{target}]);}
  };
  try {
    status=mountBtcRefreshStatus({document,onRetry:()=>{retries++;},now:()=>now});
    status.update({page:'compare',phase:'failed',asOf:'2026-10-25'});
    assert.equal(notice.hidden,false);
    assert.equal(document.getElementById('main').dataset.btcNotice,'true');
    assert.equal(reserved(),'53px','a late compare notice must consume space inside the fixed chart allocation');
    assert.equal(chartReserved(),'0px','compare must not move outlook-only mobile menus');
    assert.deepEqual([...observer.targets],[notice]);
    noticeHeight=45;observer.notify(notice);
    assert.equal(reserved(),'45px','notice wrapping can change its reservation without a window resize');
    assert.equal(chartReserved(),'0px');
    button.dispatchEvent(new window.Event('click'));
    assert.equal(retries,1);
    status.update({page:'compare',phase:'failed'});
    button.dispatchEvent(new window.Event('click'));
    assert.equal(retries,2,'rerendering must not attach another retry listener');
    status.update({phase:'refreshing'});
    button.dispatchEvent(new window.Event('click'));
    assert.equal(retries,2,'busy notice cannot start another retry');
    status.update({phase:'idle'});
    assert.equal(notice.hidden,true);
    assert.equal(reserved(),'0px');
    assert.equal(chartReserved(),'0px');
    assert.equal(document.getElementById('main').dataset.btcNotice,undefined);
    for(const page of ['conference','data']) {
      status.update({page,phase:'failed'});
      assert.equal(reserved(),'0px',page+' must not inherit the chart reservation');
      assert.equal(chartReserved(),'0px');
      noticeHeight=53;observer.notify(notice);
      assert.equal(reserved(),'0px',page+' must stay unreserved after a notice resize');
      assert.equal(chartReserved(),'0px');
    }
    status.update({page:'outlook'});
    assert.equal(chartReserved(),'53px','outlook keeps its existing notice and mobile-menu reservation');
    assert.equal(reserved(),'0px','outlook must not inherit the compare-only reservation');
    status.update({page:'compare'});
    assert.equal(reserved(),'53px');
    assert.equal(chartReserved(),'0px');
    assert.equal(document.querySelectorAll('#btc-refresh-notice').length,1);
    assert.equal(document.getElementById('btc-refresh-notice'),notice);
    assert.equal(document.getElementById('btc-refresh-retry'),button);
    status.destroy();
    assert.equal(reserved()||'','');
    assert.equal(chartReserved()||'','');
    assert.equal(observer.targets.size,0);
    button.dispatchEvent(new window.Event('click'));
    assert.equal(retries,2,'disposal removes the existing button listener');
  } finally {
    status?.destroy();
    if(previousResize)Object.defineProperty(globalThis,'ResizeObserver',previousResize);
    else delete globalThis.ResizeObserver;
  }
});
