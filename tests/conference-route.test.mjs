import test from 'node:test';
import assert from 'node:assert/strict';
import {createConferenceRoute} from '../dist/conference/route.js';
import {parseComparisonUrl, COMPARISON_OWNED_KEYS} from '../dist/comparison-url-state.js';
import {atlasPageHref, atlasNavigationPages} from '../dist/atlas-navigation.js';
import {CONTENT_SHELL_PAGES} from '../dist/content-shell.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
function fixture(loadPlayer) {
  const calls = {ready:0, errors:[], mounts:0, loads:0, syncs:0, destroys:0};
  const module = {mountConferencePlayer(host, {timelineUrl}) {
    assert.equal(host.id, 'conference-view');
    assert.equal(timelineUrl, '/atlas/conference/timeline.json');
    calls.mounts += 1;
    return {load() { calls.loads += 1; }, syncFromUrl() { calls.syncs += 1; }, destroy() { calls.destroys += 1; }};
  }};
  const route = createConferenceRoute({host:{id:'conference-view'}, timelineUrl:'/atlas/conference/timeline.json',
    loadPlayer:loadPlayer || (() => Promise.resolve(module)), onReady:() => calls.ready++, onError:error => calls.errors.push(error.message)});
  return {route, calls, module};
}

test('conference is a distinct reachable content route without owning player URL fields', () => {
  assert.equal(parseComparisonUrl('?page=conference&t=3725&deck=r17-257').view, 'conference');
  assert.equal(atlasPageHref('conference'), '/?page=conference');
  assert.equal(atlasNavigationPages.at(-1).label, '컨퍼런스 복습');
  assert.ok(CONTENT_SHELL_PAGES.includes('conference'));
  assert.ok(!COMPARISON_OWNED_KEYS.includes('t') && !COMPARISON_OWNED_KEYS.includes('deck'));
});

test('one visit mounts once and leaving tears down the player before a fresh return', async () => {
  const {route, calls} = fixture();
  const first = route.setActive(true);
  assert.equal(route.setActive(true), first);
  await first;
  await route.setActive(true);
  assert.deepEqual(calls, {ready:1, errors:[], mounts:1, loads:1, syncs:1, destroys:0});
  await route.setActive(false);
  await route.setActive(false);
  await route.setActive(true);
  assert.deepEqual(calls, {ready:2, errors:[], mounts:2, loads:2, syncs:1, destroys:1});
  route.destroy(); route.destroy();
  await route.setActive(true);
  assert.equal(calls.mounts, 2);
  assert.equal(calls.destroys, 2);
});

test('a stale module import cannot mount after departure or report readiness for a new visit', async () => {
  const old = deferred(), next = deferred();
  let imports = 0;
  const {route, calls, module} = fixture(() => (++imports === 1 ? old.promise : next.promise));
  const first = route.setActive(true);
  await Promise.resolve();
  await route.setActive(false);
  const second = route.setActive(true);
  old.resolve(module); await first;
  assert.equal(calls.mounts, 0);
  next.resolve(module); await second;
  assert.equal(calls.mounts, 1);
  assert.equal(calls.ready, 1);
  route.destroy();
});

test('departure during load destroys audio ownership and suppresses a late ready/error', async () => {
  for (const reject of [false, true]) {
    const loading = deferred();
    let destroys = 0, ready = 0, errors = 0;
    const route = createConferenceRoute({host:{}, loadPlayer:() => ({mountConferencePlayer:() => ({load:() => loading.promise, syncFromUrl() {}, destroy() { destroys++; }})}),
      onReady:() => ready++, onError:() => errors++});
    const active = route.setActive(true);
    await Promise.resolve(); await Promise.resolve();
    await route.setActive(false);
    if (reject) loading.reject(new Error('late fetch')); else loading.resolve();
    await active;
    assert.deepEqual({destroys, ready, errors}, {destroys:1, ready:0, errors:0});
    route.destroy();
  }
});

test('an active import failure is reported and a later visit can retry', async () => {
  let attempts = 0;
  const {route, calls, module} = fixture(() => { if (++attempts === 1) throw new Error('module unavailable'); return module; });
  await route.setActive(true);
  assert.deepEqual(calls.errors, ['module unavailable']);
  await route.setActive(true);
  assert.equal(calls.ready, 1);
  route.destroy();
});
