import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTlc, TLC_JAR, TLC_SHA256, verificationProcessResult } from './verification-process.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineCommit = '64c8207cb044d8990289c5a7d39972e21b74c240';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const invariants = ['TypeOK', 'ReadyHasUsableView', 'NoHiddenPublication', 'NoStalePublication', 'NavigationSurvivesRefresh', 'NativeNavigationSurvivesRefresh', 'ReadinessOnce'];
const invariantsBeforeChartMount = invariants.filter(name => name !== 'NativeNavigationSurvivesRefresh');
const failuresBeforeFix = ['ReadyHasUsableView', 'NoHiddenPublication', 'NavigationSurvivesRefresh'];
const cases = 26;
const TLC_FOUND_VIOLATION = 12, TESTS_FAILED = 1, PROCESS_TIMEOUT_MS = 180000;

const failures = [];
const fail = (id, reason) => { failures.push({ id, reason }); console.log(id + ': FAILED (' + reason + ')'); };

function run(command, args, { env = {}, found } = {}) {
  const result = spawnSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', timeout: PROCESS_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  return verificationProcessResult(result, { command, expectedStatus: result.status === found ? found : 0 });
}

async function models(work) {
  await mkdir(path.join(work, 'configs'));
  await mkdir(path.join(work, 'states'));
  const directory = path.join(root, 'verification/eth-state');
  // TLC 1.7.4 resolves an absolute spec against its own parent and can then
  // miss a configuration outside that directory. Use the fixed repository cwd.
  const source = 'verification/eth-state/EthLoad.tla';
  const config = await readFile(path.join(directory, 'EthLoad.cfg'), 'utf8');
  const variants = [
    { id: 'current', values: {}, rules: invariants, broken: [] },
    { id: 'baseline', values: { BootOnRender: false, RespectSuspension: false, PreserveNavigation: false }, rules: invariantsBeforeChartMount, broken: failuresBeforeFix },
    { id: 'unguarded-response', values: { GuardResponses: false }, broken: ['NoStalePublication'] },
    { id: 'unguarded-error', values: { GuardErrors: false }, broken: ['NoStalePublication'] },
    { id: 'hidden-render', values: { RespectSuspension: false }, broken: ['NoHiddenPublication'] },
    { id: 'lost-navigation', values: { PreserveNavigation: false }, broken: ['NavigationSurvivesRefresh'] },
    { id: 'unpainted-ready', values: { WaitForPaint: false }, broken: ['ReadyHasUsableView'] },
    { id: 'hidden-paint', values: { GuardPaintSuspension: false }, broken: ['NoHiddenPublication'] },
    { id: 'stale-mount-paint', values: { GuardPaintMount: false }, broken: ['NoStalePublication'] },
    { id: 'hidden-viewport', values: { GuardViewport: false }, broken: ['NoHiddenPublication'] },
    { id: 'lost-native-navigation', values: { TrackNativeNavigation: false }, broken: ['NativeNavigationSurvivesRefresh'] },
  ];
  const results = {};
  let searches = 0;
  for (const variant of variants) {
    let reviewed = config;
    for (const [name, enabled] of Object.entries(variant.values)) reviewed = reviewed.replace(name + ' = TRUE', name + ' = ' + (enabled ? 'TRUE' : 'FALSE'));
    assert.equal(await readFile(path.join(directory, variant.id === 'current' ? 'EthLoad.cfg' : variant.id + '.cfg'), 'utf8'), reviewed, 'Reviewed configuration drift: ' + variant.id);
    const search = async rules => {
      const name = variant.id + '-' + ++searches, file = path.join(work, 'configs', name + '.cfg');
      await writeFile(file, reviewed.replace(/^INVARIANTS .*$/m, 'INVARIANTS ' + rules.join(' ')));
      const result = run(process.env.JAVA || 'java', ['-XX:+UseParallelGC', '-Xmx1g', '-cp', TLC_JAR, 'tlc2.TLC', '-workers', '1', '-seed', '1', '-fp', '0', '-metadir', path.join(work, 'states', name), '-config', file, source], { found: TLC_FOUND_VIOLATION });
      const violated = result.output.match(/Invariant (\w+) is violated/)?.[1] ?? null;
      assert.equal(result.status === 12, Boolean(violated), 'TLC exit status and violation report disagree: ' + name + '\n' + result.output);
      if (!violated) assert.match(result.output, /Model checking completed\. No error has been found\./);
      const counts = result.output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
      assert.ok(counts, 'TLC did not finish with state counts: ' + name);
      return { violated, exitStatus: result.status, generated: Number(counts[1].replaceAll(',', '')), distinct: Number(counts[2].replaceAll(',', '')), remaining: Number(counts[3].replaceAll(',', '')) };
    };
    const record = (invariant, status, { violated, ...counts }) => {
      const id = variant.id + '/' + invariant;
      results[id] = { status, invariant, ...counts };
      if (status === 'pass' || status === 'expected invariant violation') console.log(id + ': ' + status);
      else fail(id, status);
    };
    for (const invariant of variant.broken) {
      const result = await search([invariant]);
      record(invariant, result.violated === invariant ? 'expected invariant violation' : 'the guard removal is not detected', result);
    }
    // A violation names one invariant. Search again without it, so that each
    // remaining invariant still gets a complete search.
    let holding = (variant.rules ?? []).filter(name => !variant.broken.includes(name));
    while (holding.length) {
      const result = await search(holding);
      if (!result.violated) { for (const invariant of holding) record(invariant, 'pass', result); break; }
      assert.ok(holding.includes(result.violated), 'TLC reported an invariant outside its configuration: ' + result.violated);
      record(result.violated, 'unexpected invariant violation', result);
      holding = holding.filter(name => name !== result.violated);
    }
  }
  return results;
}

function replay(env) {
  const result = run(process.execPath, ['--test-reporter=tap', 'tests/eth-load-ownership.test.mjs'], { env, found: TESTS_FAILED });
  // A zero exit code or a "tests" headline alone can also hide skips or a
  // wrapper that counts test files. Require actual, complete TAP case totals.
  const entries = [...result.output.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)];
  assert.equal(entries.length, 6, 'Missing or duplicate test summary fields\n' + result.output);
  const counts = Object.fromEntries(entries.map(([, name, value]) => [name, Number(value)]));
  assert.equal(Object.keys(counts).length, 6, 'Duplicate test summary field');
  assert.equal(counts.tests, cases, result.output);
  assert.equal(counts.cancelled, 0, result.output);
  assert.equal(counts.skipped, 0, result.output);
  assert.equal(counts.todo, 0, result.output);
  assert.equal(counts.pass + counts.fail, cases, result.output);
  assert.match(result.output, new RegExp('^1\\.\\.' + cases + '$', 'm'), 'The complete ' + cases + '-case TAP plan must run');
  assert.equal(result.status, counts.fail ? 1 : 0, result.output);
  const failed = new Map();
  for (const block of result.output.split(/^(?=# Subtest: )/m)) {
    const name = block.match(/^not ok \d+ - (.*)$/m)?.[1];
    if (name) failed.set(name, block);
  }
  assert.equal(failed.size, counts.fail, 'Every failed case must be named\n' + result.output);
  return { ...result, counts, failed };
}

async function implementation(work) {
  const original = replay({ ETH_VIEW_SOURCE: path.join(root, 'dist/eth-view.js') });
  console.log(original.output.trim());
  if (original.failed.size) fail('replay/original', 'failed cases: ' + [...original.failed.keys()].join(' | '));
  const source = await readFile(path.join(root, 'dist/eth-view.js'), 'utf8');
  const temporary = path.join(work, 'eth-view.js');
  const changes = [
    {
      id: 'premature-ready',
      from: 'await new Promise(resolve=>requestAnimationFrame(()=>{render();resolve();}));',
      to: "await new Promise(resolve=>requestAnimationFrame(()=>{render();resolve();}));\n  document.dispatchEvent(new CustomEvent('atlas:ready'));",
      failure: /a canceled initializer must not mark an empty restored chart ready/,
    },
    {
      // Remove only suspension ownership; keep replay and center ownership intact.
      id: 'hidden-render', from: "state.frame=null;if(suspended||svg.dataset.chartReplayActive==='true'||document.body.dataset.centerTool)return;", to: "state.frame=null;if(svg.dataset.chartReplayActive==='true'||document.body.dataset.centerTool)return;",
      failure: /a suspended initialization callback must not release the boot shell/,
    },
    {
      id: 'unguarded-archive', from: 'if(token!==generation)return;setPayload(saved);', to: 'setPayload(saved);',
      failure: /a revoked archive must not replace restored prices/,
    },
    {
      id: 'unguarded-error', from: '}catch(error){\n      if(token!==generation)return;', to: '}catch(error){',
      failure: /a revoked live failure must not taint the current status/,
    },
    {
      id: 'lost-daily-navigation',
      from: 'if(navigationToken===navigationRevision)state.range=null;\n        else if(state.range)state.range=ethHistoryRange(currentSeries(),state.span,state.range,visibleForecast()?.displayEnd);',
      to: 'state.range=null;',
      failure: /a live refresh must preserve a newer user date range/,
    },
    {
      id: 'lost-intraday-navigation',
      from: 'if(token===generation&&force&&navigationToken===navigationRevision)', to: 'if(token===generation&&force)',
      failure: /intraday refresh must preserve newer date navigation/,
    },
    {
      id: 'untracked-navigation', from: 'onRangeChange:range=>{++navigationRevision;', to: 'onRangeChange:range=>{',
      failure: /a live refresh must preserve a newer user date range/,
    },
    {
      id: 'repeated-ready', from: 'function revealReady(){if(ready)return;', to: 'function revealReady(){',
      failure: /Expected values to be strictly deep-equal/,
    },
    {
      id: 'missing-escaper', from: 'const esc = value =>', to: 'const unusedEsc = value =>',
      failure: /the information button must not call an undefined HTML escaper/,
    },
    {
      id: 'unpainted-ready', from: 'if(state.funnestReady)revealReady();', to: 'revealReady();',
      failure: /readiness must wait for the chart paint confirmation/,
    },
    {
      id: 'hidden-paint-failure', from: '.catch(error=>{if(state.funnestMount!==mount||suspended)return;', to: '.catch(error=>{if(state.funnestMount!==mount)return;',
      failure: /a suspended paint failure must not release the boot shell/,
    },
    {
      id: 'stale-mount-paint', from: '.catch(error=>{if(state.funnestMount!==mount||suspended)return;', to: '.catch(error=>{if(suspended)return;',
      failure: /a destroyed chart must not mark its replacement failed/,
    },
    {
      id: 'hidden-viewport', from: 'onViewport:visible=>{if(!visible||suspended||!state.range)return;', to: 'onViewport:visible=>{if(!visible||!state.range)return;',
      failure: /a suspended chart window report must not refresh the workbench/,
    },
    {
      id: 'partial-viewport-range', from: 'onViewport:visible=>{if(!visible||suspended||!state.range)return;', to: 'onViewport:visible=>{if(!visible||suspended)return;',
      failure: /a report on a cleared range must not leave a range without its grid/,
    },
    {
      id: 'untracked-native-navigation', from: '{++navigationRevision;state.range={...state.range,start,end};', to: '{state.range={...state.range,start,end};',
      failure: /a live refresh must not reset a window chosen on the chart while it was pending/,
    },
    {
      id: 'dropped-hidden-paint', from: '    suspended=false;\n    if(state.funnestMount&&!state.funnestReady)watchFunnestPaint(state.funnestMount);\n', to: '    suspended=false;\n',
      failure: /pageshow must reread a paint confirmation dropped while hidden/,
    },
    {
      id: 'leaked-mount', from: 'if(!event.persisted){state.funnestMount?.destroy();state.funnestMount=null;', to: 'if(!event.persisted){',
      failure: /a discarded document must destroy its chart/,
    },
  ];
  const mutations = {}, mutationExitStatuses = {};
  try {
    for (const change of changes) {
      if (source.split(change.from).length !== 2) {
        mutations[change.id] = 'selector does not match the source exactly once';
        fail('mutation/' + change.id, 'Review model/code correspondence and mutation selector');
        continue;
      }
      await writeFile(temporary, source.replace(change.from, change.to));
      const result = replay({ ETH_VIEW_SOURCE: temporary });
      mutationExitStatuses[change.id] = result.status;
      const caught = [...result.failed].some(([name, block]) => !original.failed.has(name) && change.failure.test(block));
      mutations[change.id] = caught ? 'expected assertion failure' : 'not detected';
      if (caught) console.log('mutation/' + change.id + ': expected assertion failure');
      else fail('mutation/' + change.id, 'no passing case fails with ' + change.failure);
    }
  } finally {
    // Never alter the working runtime; restore and exercise the scratch copy too.
    await writeFile(temporary, source);
  }
  const restored = replay({ ETH_VIEW_SOURCE: temporary });
  assert.deepEqual([...restored.failed.keys()], [...original.failed.keys()], 'The restored copy must behave like the working runtime');
  return {
    tests: cases, original: original.failed.size ? 'fail' : 'pass', restored: restored.failed.size ? 'fail' : 'pass',
    originalCounts: original.counts, restoredCounts: restored.counts, failedCases: [...original.failed.keys()],
    sourceSha256: hash(source), mutations, mutationExitStatuses,
  };
}

await prepareTlc();
const work = await mkdtemp(path.join(tmpdir(), 'atlas-eth-proof-'));
try {
  const model = await models(work), implemented = await implementation(work);
  const report = {
    baselineCommit, tool: { name: 'TLC', release: '1.7.4', jarSha256: TLC_SHA256 },
    bounds: { requestGenerations: 3, intervals: ['daily', 'weekly'], rangeChoices: ['auto', 'custom'] },
    verdict: failures.length ? 'fail' : 'pass', failures,
    model, implementation: implemented,
    limitations: [
      'Finite reachable-state check, not an unbounded or whole-program proof',
      'HTTP abort can complete late; callbacks while suspended are a deliberate scheduler over-approximation',
      'Initializer replay injects import, HTTP, animation-frame, timer and DOM boundaries',
      'The replay injects the chart mount, so paint results, window reports and teardown run at the adapter boundary and not in the Funnest engine',
      'Intraday controller publication is covered by verify-market-state; ETH integration is replay-tested',
      'No price accuracy, causal event effect, pixel layout, browser scheduling or liveness proof',
    ],
  };
  if (process.argv[2]) await writeFile(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) {
    console.error('verify-eth-state FAILED\n' + failures.map(({ id, reason }) => '  ' + id + ': ' + reason).join('\n'));
    process.exitCode = 1;
  }
} finally { await rm(work, { recursive: true, force: true }); }
