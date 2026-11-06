import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountCenterWorkbench } from '../../dist/center-workbench.js';

function fixture(t: TestContext, page: string, { service = false, booting = false } = {}) {
  const root = service ? '/' : '/bitcoin-cycle-atlas/';
  const meta = service ? '<meta name="atlas-service-base" content="/market-lab/">'
    : `<meta name="atlas-root" content="${root}"><meta name="atlas-static-entry" content="market-lab/app/">`;
  const { document, window: dom } = parseHTML(`<html><head>${meta}</head><body${booting ? '' : ` data-page="${page}"`}><nav>
    <button data-atlas-page="market-us">시장 분석</button><button data-atlas-page="rsi">종목 차트</button>
    <button data-atlas-page="data">자산 비교</button><button data-atlas-page="ipo">공모주</button>
    <button data-atlas-page="evidence">리서치</button><button data-atlas-page="outlook">가격 차트</button>
    </nav></body></html>`);
  const original = new Map(['document', 'window', 'location', 'MutationObserver', 'CustomEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const destinations: string[] = [], histories: string[] = [], posts: unknown[] = [];
  const listeners = new Map<string, (event: any) => void>();
  const url = new URL(`http://localhost${root}?page=${page}`);
  const location = Object.assign(url, { assign: (href: string) => destinations.push(href), replace: (href: string) => destinations.push(href) });
  const browser = { parent: null as unknown, addEventListener(kind: string, listener: (event: any) => void) { listeners.set(kind, listener); }, history: {
    pushState(_state: unknown, _title: unknown, href: string) { histories.push(href); },
    replaceState(_state: unknown, _title: unknown, href: string) { histories.push(href); },
  } };
  browser.parent = browser;
  for (const [key, value] of Object.entries({ document, window: browser, location, MutationObserver: dom.MutationObserver, CustomEvent: dom.CustomEvent }))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  t.after(() => { for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const create = document.createElement.bind(document);
  document.createElement = ((tag: string) => { const element = create(tag); if (tag === 'iframe') Object.defineProperty(element, 'contentWindow', { value: { postMessage: (message: unknown) => posts.push(message) } }); return element; }) as typeof document.createElement;
  mountCenterWorkbench();
  function click(id: string, modified = false) {
    const event = new dom.Event('click', { bubbles: true, cancelable: true });
    if (modified) Object.defineProperty(event, 'ctrlKey', { value: true });
    document.querySelector(`[data-atlas-page="${id}"]`)!.dispatchEvent(event);
    return event;
  }
  async function addPlot() {
    const plot = create('section'); plot.className = 'atlas-plot'; plot.innerHTML = '<svg id="original-chart"></svg>'; document.body.append(plot);
    await new Promise(resolve => setImmediate(resolve));
    return plot;
  }
  return { document, root, destinations, histories, posts, listeners, location, click, addPlot };
}

test('direct dashboard entries navigate into the shared shell without waiting for a missing chart', async t => {
  for (const service of [false, true]) for (const page of ['data', 'ipo', 'evidence', 'compare']) await t.test(`${service ? 'service' : 'static'} ${page}`, sub => {
    const f = fixture(sub, page, { service });
    for (const [target, suffix] of [
      ['market-us', 'market-lab/'], ['rsi', 'market-lab/charts/?symbol=TQQQ'],
      ['ipo', '?page=outlook&center=ipo'], ['data', '?page=outlook&center=data'], ['evidence', '?page=outlook&center=evidence'],
    ]) {
      assert.equal(f.click(target).defaultPrevented, true);
      assert.equal(f.destinations.at(-1), `${f.root}${suffix}`);
      assert.equal(f.document.querySelector('iframe'), null);
    }
    assert.equal(f.histories.length, 0, 'the old dashboard cannot claim a center URL without a visible host');
    const before = f.destinations.length;
    assert.equal(f.click('market-us', true).defaultPrevented, false);
    assert.equal(f.click('outlook').defaultPrevented, false, 'the existing return-to-price handler keeps ownership');
    assert.equal(f.destinations.length, before);
  });
});

test('dashboard navigation also works before its view owner has initialized', t => {
  const f = fixture(t, 'data', { booting: true });
  f.click('market-us');
  assert.deepEqual(f.destinations, ['/bitcoin-cycle-atlas/market-lab/']);
});

test('a hidden plot from an earlier price visit does not capture dashboard navigation', async t => {
  const f = fixture(t, 'data');
  const plot = await f.addPlot(); plot.hidden = true;
  f.click('rsi');
  assert.deepEqual(f.destinations, ['/bitcoin-cycle-atlas/market-lab/charts/?symbol=TQQQ']);
  assert.equal(f.document.querySelector('iframe'), null);
  assert.equal(f.document.querySelector('#original-chart')!.hasAttribute('aria-hidden'), false);
});

test('a menu choice during real chart startup still waits for and reuses that host', async t => {
  const f = fixture(t, 'outlook');
  f.click('market-us');
  assert.equal(f.destinations.length, 0);
  assert.equal(f.histories.length, 0);
  const plot = await f.addPlot();
  assert.equal(f.document.querySelector('iframe')?.parentElement, plot);
  assert.equal(f.document.body.dataset.centerTool, 'market-us');
  assert.deepEqual(f.histories, ['/bitcoin-cycle-atlas/market-lab/']);
  assert.equal(f.destinations.length, 0);
});

test('consecutive child intents retain the final choice and cannot cross a newer host navigation', async t => {
  const f = fixture(t, 'outlook');
  await f.addPlot(); f.click('market-us');
  const frame = f.document.querySelector('iframe') as HTMLIFrameElement;
  const send = (data: Record<string, unknown>, source: unknown = frame.contentWindow, origin = 'http://localhost') => f.listeners.get('message')!({ data, source, origin });
  const first = { kind: 'atlas:center-select', page: 'market-kr', symbol: 'TQQQ', epoch: 1, intentSerial: 1 };
  const last = { ...first, page: 'scenario', intentSerial: 2 };
  send(first); send(last);
  assert.equal(f.document.body.dataset.centerTool, 'scenario');
  assert.equal(f.histories.at(-1), '/bitcoin-cycle-atlas/market-lab/?view=scenario');
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'scenario', symbol: 'TQQQ', epoch: 3, intentSerial: 2 });
  const accepted = f.histories.length;
  send(first); send(last); send({ ...last, intentSerial: 3 }, {}); send({ ...last, intentSerial: 3 }, undefined, 'https://foreign.test');
  send({ ...last, intentSerial: 0 }); send({ ...last, intentSerial: NaN }); send({ ...last, epoch: 100, intentSerial: 3 });
  assert.equal(f.histories.length, accepted, 'duplicates, reordered choices and foreign or malformed requests cannot change the selected view');
  send({ kind: 'atlas:center-state', page: 'market-kr', symbol: 'TQQQ', epoch: 2 });
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'scenario', symbol: 'TQQQ', epoch: 3, intentSerial: 2 });

  f.click('rsi');
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'rsi', symbol: 'TQQQ', epoch: 4 });
  const afterHost = f.histories.length;
  send({ ...last, page: 'cashflow', intentSerial: 100 });
  assert.equal(f.histories.length, afterHost, 'a larger serial cannot revive an intent from before a host menu action');
  send({ ...last, page: 'housing', symbol: 'HOUSING-SEOUL', epoch: 4, intentSerial: 3 });
  send({ ...last, page: 'housing', symbol: 'HOUSING-BUSAN', epoch: 4, intentSerial: 4 });
  assert.equal(f.histories.at(-1), '/bitcoin-cycle-atlas/market-lab/charts/?symbol=HOUSING-BUSAN&region=busan');
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'housing', symbol: 'HOUSING-BUSAN', region: 'busan', epoch: 6, intentSerial: 4 });

  f.location.search = '?page=outlook&center=scenario'; f.listeners.get('popstate')!({});
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'scenario', symbol: 'HOUSING-BUSAN', epoch: 7 });
  const afterBack = f.histories.length;
  send({ ...last, page: 'themes', symbol: 'HYPE', epoch: 4, intentSerial: 100 });
  assert.equal(f.histories.length, afterBack, 'browser history also invalidates requests from the old view');
  send({ ...last, page: 'themes', symbol: 'HYPE', epoch: 7, intentSerial: 5 });
  assert.equal(f.document.body.dataset.centerTool, 'themes');
  assert.equal(f.histories.at(-1), '/bitcoin-cycle-atlas/market-lab/charts/?symbol=HYPE');
});
