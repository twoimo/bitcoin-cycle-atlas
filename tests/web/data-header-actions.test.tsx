import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountDataHeaderActions} from '../../dist/data-header-actions.js';

test('header actions use the active board handlers, mirror availability and restore the original surface',async()=>{
  const {document}=parseHTML('<html><body><header></header><iframe></iframe></body></html>');
  const child=parseHTML('<html><body><button id="asset-refresh" aria-label="가격 자료 갱신">갱신</button><button id="asset-history-open" disabled>판단 이력</button><button id="daily-method-open">읽는 법</button><button id="export-raw" disabled>CSV</button></body></html>').document;
  const frame=document.querySelector('iframe')!;Object.defineProperty(frame,'contentDocument',{value:child,configurable:true});
  let active=true,refreshes=0,exports=0;
  child.getElementById('asset-refresh')!.addEventListener('click',()=>refreshes++);
  child.getElementById('export-raw')!.addEventListener('click',()=>exports++);
  const toolbar=mountDataHeaderActions({frame,heading:document.querySelector('header'),isActive:()=>active});
  assert.equal(child.body.dataset.dataActionsHosted,'true');
  assert.equal(document.querySelectorAll('.center-data-action').length,4);
  const refresh=document.getElementById('center-asset-refresh') as HTMLButtonElement;
  const csv=document.getElementById('center-export-raw') as HTMLButtonElement;
  assert.equal(csv.disabled,true);assert.equal(refresh.getAttribute('aria-label'),'가격 자료 갱신');
  refresh.click();assert.equal(refreshes,1);
  (child.getElementById('export-raw') as HTMLButtonElement).disabled=false;
  await new Promise(resolve=>setImmediate(resolve));assert.equal(csv.disabled,false);
  csv.click();assert.equal(exports,1);
  active=false;refresh.click();csv.click();assert.equal(refreshes,1);assert.equal(exports,1,'hidden/stale boards cannot dispatch actions');
  toolbar.destroy();assert.equal(document.querySelector('.center-data-actions'),null);assert.equal(child.body.dataset.dataActionsHosted,undefined);
  assert.equal(child.getElementById('asset-refresh')?.parentElement,child.body,'the source action remains with its original event owner');
});

test('closing a board dialog restores its visible header trigger only while the board is active',async()=>{
  const {document}=parseHTML('<html><body><header></header><iframe></iframe></body></html>');
  const child=parseHTML('<html><body><button id="asset-refresh">갱신</button><button id="asset-history-open">판단 이력</button><button id="daily-method-open">읽는 법</button><button id="export-raw">CSV</button><dialog></dialog></body></html>').document;
  const frame=document.querySelector('iframe')!;Object.defineProperty(frame,'contentDocument',{value:child});
  const dialog=child.querySelector('dialog')!;let active=true,focused=0;
  child.getElementById('daily-method-open')!.addEventListener('click',()=>dialog.setAttribute('open',''));
  const toolbar=mountDataHeaderActions({frame,heading:document.querySelector('header'),isActive:()=>active});
  const trigger=document.getElementById('center-daily-method-open')!;trigger.focus=()=>{focused++;};
  trigger.click();assert.equal(dialog.hasAttribute('open'),true);
  dialog.removeAttribute('open');dialog.dispatchEvent(new child.defaultView!.Event('close',{bubbles:true}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(focused,1);
  trigger.click();active=false;
  dialog.removeAttribute('open');dialog.dispatchEvent(new child.defaultView!.Event('close',{bubbles:true}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(focused,1,'a closed stale frame cannot steal focus');
  toolbar.destroy();
});
