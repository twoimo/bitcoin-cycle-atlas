import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { createCompareShellHost } from '../dist/compare-shell-host.js';

// DOM round-trip behaviour for the compare route, including the case a full
// page navigation hides: after the toolbar has been moved, a later deactivate
// must still find and restore it.
const REASON = '사이클 비교에서는 사용할 수 없습니다';

function fixture({ embedded = false } = {}) {
  const { document, window } = parseHTML(`<html><body${embedded ? ' data-embedded="true"' : ''} data-page="outlook">
    <header class="atlas-canvas-heading">
      <button id="workbench-chart-type" aria-label="선 표시"></button>
      <fieldset id="workbench-frequency"><select id="workbench-interval-select"><option>1D</option></select></fieldset>
    </header>
    <div class="workspace">
      <main id="main">
        <section id="outlook-view"><section class="lab-panel"><div class="atlas-plot"><svg id="lab-chart"></svg></div></section></section>
        <section id="compare-view"><section class="lab-panel">
          <div class="lab-toolbar"><select id="structure-scope"><option>all</option></select><button id="structure-json">JSON</button></div>
          <div class="lab-chart-meta">meta</div>
        </section></section>
        <section id="data-view" hidden></section>
      </main>
      <nav class="workbench-tools"><button id="tool-crosshair"></button><button id="workbench-clear" disabled></button></nav>
      <footer class="workbench-bottom-bar"><button id="range-4y"></button><select id="workbench-range-select"></select><button id="atlas-update-status"></button></footer>
    </div></body></html>`);
  return { document, window };
}

const parents = (document) => ({
  section: document.querySelector('#compare-view').parentElement?.className || document.querySelector('#compare-view').parentElement?.id,
  toolbar: document.querySelector('.lab-toolbar').parentElement?.className || document.querySelector('.lab-toolbar').parentElement?.id,
});

test('three DOM round trips keep the originals and restore them exactly', () => {
  const { document } = fixture();
  const host = createCompareShellHost({ document });
  const section = document.querySelector('#compare-view');
  const toolbar = document.querySelector('.lab-toolbar');
  const mainIndex = [...document.querySelector('#main').children].indexOf(section);

  for (let trip = 0; trip < 3; trip++) {
    host.setActive(true);
    assert.equal(host.isActive(), true);
    assert.equal(section.parentElement.className, 'atlas-plot', `trip ${trip}: the section moves into the centre`);
    assert.equal(toolbar.parentElement.className, 'atlas-canvas-heading', `trip ${trip}: the real toolbar moves into the top row`);
    assert.equal(document.querySelectorAll('#compare-view .lab-toolbar').length, 0, 'no duplicate inner toolbar');
    assert.equal(document.querySelectorAll('.lab-toolbar').length, 1, 'exactly one toolbar exists');

    host.setActive(false);
    assert.equal(host.isActive(), false);
    assert.equal([...document.querySelector('#main').children].indexOf(section), mainIndex, `trip ${trip}: the section returns to its slot`);
    assert.equal(section.nextElementSibling.id, 'data-view', 'the following section order is intact');
    assert.equal(toolbar.parentElement.className, 'lab-panel', `trip ${trip}: the toolbar returns to its panel`);
    assert.equal(toolbar.nextElementSibling.className, 'lab-chart-meta', 'and before its original sibling');
    assert.equal(document.querySelectorAll('.lab-toolbar').length, 1);
  }
  assert.deepEqual(parents(document), { section: 'main', toolbar: 'lab-panel' });
});

test('price-only frame controls are disabled with a stated reason and restored', () => {
  const { document } = fixture();
  const host = createCompareShellHost({ document });
  const crosshair = document.querySelector('#tool-crosshair');
  const range = document.querySelector('#range-4y');
  const rangeSelect = document.querySelector('#workbench-range-select');
  const clear = document.querySelector('#workbench-clear');
  const update = document.querySelector('#atlas-update-status');

  host.setActive(true);
  for (const control of [crosshair, range, rangeSelect]) {
    assert.equal(control.disabled, true, `${control.id} is disabled on compare`);
    assert.match(control.getAttribute('data-disabled-reason') || '', new RegExp(REASON), 'the reason is stated');
  }
  assert.equal(clear.disabled, true, 'an already-disabled control stays disabled');
  assert.equal(update.disabled, false, 'the data-source status stays usable');

  host.setActive(false);
  assert.equal(crosshair.disabled, false, 'chart tools return to enabled');
  assert.equal(range.disabled, false, 'range buttons return to enabled');
  assert.equal(rangeSelect.disabled, false);
  assert.equal(clear.disabled, true, 'a control that was disabled before compare keeps its own state');
  assert.equal(crosshair.hasAttribute('data-disabled-reason'), false, 'the reason is removed with the lock');
  assert.equal(crosshair.hasAttribute('aria-disabled'), false);
});

test('an embedded child document is left alone', () => {
  const { document } = fixture({ embedded: true });
  const host = createCompareShellHost({ document });
  const section = document.querySelector('#compare-view');
  const toolbar = document.querySelector('.lab-toolbar');
  host.setActive(true);
  assert.equal(section.parentElement.id, 'main', 'the authored section is not nested into the frame');
  assert.equal(toolbar.parentElement.className, 'lab-panel', 'its toolbar stays in place');
  assert.equal(document.querySelector('#tool-crosshair').disabled, false, 'no control is locked in the child');
});

test('activation is idempotent for repeat calls with the same state', () => {
  const { document } = fixture();
  const host = createCompareShellHost({ document });
  host.setActive(true);
  const toolbar = host.toolbar;
  host.setActive(true);
  assert.equal(host.toolbar, toolbar, 'the cached node is reused, not re-queried');
  assert.equal(document.querySelectorAll('.lab-toolbar').length, 1);
  assert.equal(host.lockedControls.length, 4, 'both rail buttons, the range button and the range select');
});

test('native and ARIA disabled states are captured and restored individually', () => {
  const { document } = fixture();
  const host = createCompareShellHost({ document });
  const plain = document.querySelector('#tool-crosshair');
  const native = document.querySelector('#workbench-clear');           // disabled, no aria
  const ariaTrue = document.querySelector('#range-4y');                // enabled, aria-disabled="true"
  ariaTrue.setAttribute('aria-disabled', 'true');
  const ariaFalse = document.querySelector('#workbench-range-select'); // enabled, aria-disabled="false"
  ariaFalse.setAttribute('aria-disabled', 'false');
  const update = document.querySelector('#atlas-update-status');

  host.setActive(true);
  for (const control of [plain, native, ariaTrue, ariaFalse]) {
    assert.equal(control.disabled, true, 'locked while compare is active');
    assert.equal(control.getAttribute('aria-disabled'), 'true');
  }
  assert.equal(update.disabled, false, 'the source status stays usable');

  host.setActive(false);
  assert.equal(plain.disabled, false);
  assert.equal(plain.hasAttribute('aria-disabled'), false, 'a control without aria-disabled keeps none');
  assert.equal(native.disabled, true, 'a natively disabled control stays natively disabled');
  assert.equal(native.hasAttribute('aria-disabled'), false, 'and gains no aria attribute');
  assert.equal(ariaTrue.disabled, false);
  assert.equal(ariaTrue.getAttribute('aria-disabled'), 'true', 'a pre-existing aria-disabled=true is restored');
  assert.equal(ariaFalse.disabled, false);
  assert.equal(ariaFalse.getAttribute('aria-disabled'), 'false', 'a pre-existing aria-disabled=false is restored, not dropped');
});

test('mobile return keeps its original identity, listener, label and slot across compare trips', () => {
  const {document,window}=fixture();
  const home=document.createElement('button'),next=document.createElement('div');home.id='mobile-chart-home';home.setAttribute('aria-label','통합 차트로 돌아가기');document.body.append(home,next);
  let calls=0;home.addEventListener('click',()=>calls++);const host=createCompareShellHost({document});
  for(let i=0;i<3;i++){host.setActive(true);host.setActive(true);assert.equal(home.parentElement===document.querySelector('.atlas-canvas-heading'),true);assert.equal(home.nextElementSibling===host.toolbar,true);assert.equal(document.querySelectorAll('#mobile-chart-home').length,1);assert.equal(home.disabled,false);home.dispatchEvent(new window.Event('click'));host.setActive(false);assert.equal(home.parentElement===document.body,true);assert.equal(home.nextSibling===next,true);}
  assert.equal(calls,3);assert.equal(home.getAttribute('aria-label'),'통합 차트로 돌아가기');
});

test('a late-created mobile return is hosted, while removed controls are not resurrected', () => {
  const {document}=fixture(),host=createCompareShellHost({document});host.setActive(true);const home=document.createElement('button');home.id='mobile-chart-home';document.body.append(home);host.setActive(true);assert.equal(home.parentElement===document.querySelector('.atlas-canvas-heading'),true);home.remove();host.setActive(false);assert.equal(home.isConnected,false);assert.equal(document.getElementById('mobile-chart-home'),null);
});
