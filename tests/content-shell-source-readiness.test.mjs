import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import {
  createContentShell,
  SOURCE_READY_ATTRIBUTE,
  SOURCE_READY_EVENT,
  SOURCE_SHEET_REASON,
} from '../dist/content-shell.js';

// The dashboard routes move the site footer into their bottom region, and that
// footer's source control belongs to the price document. The control must not
// expose a dead action while the price owner cannot fill the sheet, and it must
// become usable in the same document as soon as that owner reports readiness.
function fixture() {
  const { document, window } = parseHTML(`<html><body>
    <div class="workspace">
      <div class="atlas-sidebar"><nav class="atlas-nav"><a href="#chart">통합 차트</a></nav></div>
      <main id="main">
        <footer class="footer"><button type="button" data-method>데이터와 출처, 이용 조건</button></footer>
      </main>
    </div>
  </body></html>`);
  const sidebar = document.querySelector('.atlas-sidebar');
  // linkedom has no layout engine; the shell only needs the rendered check.
  sidebar.getClientRects = () => [{ width: 220, height: 640 }];
  const control = document.querySelector('#main > .footer [data-method]');
  const shell = createContentShell({ document });
  const publish = ready => {
    document.body.dataset[SOURCE_READY_ATTRIBUTE] = ready ? 'ready' : 'unavailable';
    document.dispatchEvent(new window.Event(SOURCE_READY_EVENT));
  };
  return { document, window, shell, control, publish };
}

test('a content route keeps the source control locked until the price owner reports readiness', () => {
  const { document, shell, control, publish } = fixture();
  shell.setActive(true);

  assert.equal(control.disabled, true, 'an unprepared route must not expose the sheet opener');
  assert.equal(control.getAttribute('aria-disabled'), 'true');
  assert.equal(control.getAttribute('data-disabled-reason'), SOURCE_SHEET_REASON);
  assert.equal(control.getAttribute('aria-description'), SOURCE_SHEET_REASON);
  assert.deepEqual(shell.lockedSources, [control], 'the shell owns the lock it applied');
  assert.equal(Boolean(document.querySelector('.content-bottom-bar .footer')), true, 'the footer moved into the bottom region');

  publish(true);
  assert.equal(control.disabled, false, 'readiness in the same document must release the control');
  assert.equal(control.hasAttribute('aria-disabled'), false);
  assert.equal(control.hasAttribute('data-disabled-reason'), false, 'the stale reason must not survive readiness');
  assert.equal(control.hasAttribute('aria-description'), false);
  assert.deepEqual(shell.lockedSources, []);

  publish(false);
  assert.equal(control.disabled, true, 'losing the dataset must re-lock instead of leaving a dead opener');
  assert.equal(control.getAttribute('data-disabled-reason'), SOURCE_SHEET_REASON);
});

test('a shell mounted after the price owner reported readiness stays usable', () => {
  const { shell, control, publish } = fixture();
  publish(true);
  shell.setActive(true);

  assert.equal(control.disabled, false);
  assert.equal(control.hasAttribute('data-disabled-reason'), false);
  assert.deepEqual(shell.lockedSources, []);
});

test('leaving the content route restores the footer and its original control state', () => {
  const { document, shell, control } = fixture();
  shell.setActive(true);
  assert.equal(control.disabled, true);

  shell.setActive(false);
  assert.equal(document.querySelector('#main > .footer [data-method]'), control, 'the footer returned to its own page');
  assert.equal(control.disabled, false, 'the lock is released with the route');
  assert.equal(control.hasAttribute('aria-disabled'), false);
  assert.equal(control.hasAttribute('data-disabled-reason'), false);
  assert.equal(control.hasAttribute('aria-description'), false);
  assert.deepEqual(shell.lockedSources, []);
});
