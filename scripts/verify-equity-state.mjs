import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkTap, prepareTlc, runVerification, TLC_JAR, TLC_SHA256 } from './verification-process.mjs';
import { javascriptModuleSpecifiers } from './module-references.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

const implementationEntries = ['dist/equity-view.js', 'dist/equity-market-data.js', 'dist/treasury-instruments.js', 'dist/cycle-engine.js', 'dist/chart-view-policy.js', 'dist/ohlc-data.js', 'dist/price-axis.js', 'dist/index.html', 'tests/equity-load-ownership.test.mjs', 'tests/helpers/equity-view-fixture.mjs', 'tests/native-chart-viewport.test.mjs'];
const viewportArgs = ['--test-reporter=tap', '--test-name-pattern=weekly switch and scale mode', 'tests/native-chart-viewport.test.mjs'];

export async function copyEquityFixtureDependencies(copy, { sourceRoot = root, entries = implementationEntries } = {}) {
  const files = new Set();
  async function visit(file) {
    const full = path.resolve(sourceRoot, file), relative = path.relative(sourceRoot, full);
    assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Fixture dependency leaves the source root: ${file}`);
    if (files.has(relative)) return;
    const source = await readFile(full, 'utf8');
    files.add(relative);
    await mkdir(path.dirname(path.join(copy, relative)), { recursive: true });
    await copyFile(full, path.join(copy, relative));
    if (!/\.(?:mjs|js)$/.test(relative)) return;
    for (const specifier of javascriptModuleSpecifiers(source)) {
      if (isBuiltin(specifier)) continue;
      assert.ok(specifier.startsWith('./') || specifier.startsWith('../'), `Unsupported fixture module ${specifier} in ${relative}`);
      const dependency = new URL(specifier, pathToFileURL(full));
      dependency.search = ''; dependency.hash = '';
      await visit(path.relative(sourceRoot, fileURLToPath(dependency)));
    }
  }
  for (const file of entries) await visit(file);
  await writeFile(path.join(copy, 'package.json'), '{"type":"module"}\n');
  return [...files].sort();
}

// The current model runs last, after the replay and every control, so a failing property hides neither.
const variants = [
  { id: 'original-boot-order', values: { BootOnRender: false, RespectSuspension: false }, invariant: 'UsableRenderReleasesBoot' },
  { id: 'unguarded-prices', values: { GuardPrices: false }, invariant: 'NoStalePublication' },
  { id: 'unguarded-projection', values: { GuardProjection: false }, invariant: 'NoStalePublication' },
  { id: 'unguarded-errors', values: { GuardErrors: false }, invariant: 'NoStalePublication' },
  { id: 'retained-old-projection', values: { ClearProjection: false }, invariant: 'ProjectionMatchesPrices' },
  { id: 'hidden-ready', values: { RespectSuspension: false }, invariant: 'NoHiddenReadiness' },
  { id: 'overwritten-range', values: { PreserveRange: false }, invariant: 'UserRangePreserved' },
  { id: 'stale-paint-failure', values: { GuardPaint: false }, invariant: 'NoStalePublication' },
  { id: 'hidden-paint-failure', values: { GuardPaint: false }, invariant: 'NoHiddenReadiness' },
  { id: 'current', values: {}, invariant: null },
];

async function models(work) {
  const model = path.join(root, 'verification/equity-state/EquityLoad.tla');
  const config = await readFile(path.join(root, 'verification/equity-state/EquityLoad.cfg'), 'utf8');
  const results = {};
  for (const variant of variants) {
    let value = config;
    for (const [name, enabled] of Object.entries(variant.values)) value = value.replace(`${name} = TRUE`, `${name} = ${enabled ? 'TRUE' : 'FALSE'}`);
    if (variant.invariant) value = value.replace(/^INVARIANTS .*$/m, `INVARIANT ${variant.invariant}`);
    const file = path.join(root, 'verification/equity-state', variant.id === 'current' ? 'EquityLoad.cfg' : `${variant.id}.cfg`);
    assert.equal(await readFile(file, 'utf8'), value, `Reviewed configuration drift: ${variant.id}`);
    const result = runVerification(process.env.JAVA || 'java', ['-XX:+UseParallelGC', '-cp', TLC_JAR, 'tlc2.TLC', '-workers', '1', '-seed', '1', '-fp', '0', '-metadir', path.join(work, variant.id), '-config', file, model], { expectedStatus: variant.invariant ? 12 : 0 });
    if (variant.invariant) {
      assert.equal(result.status, 12, `${variant.id} must finish with the invariant-violation exit status`);
      assert.ok(result.output.includes(`Invariant ${variant.invariant} is violated`), result.output);
    } else {
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /Model checking completed\. No error has been found\./);
    }
    const counts = result.output.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);
    assert.ok(counts, 'TLC did not finish with state counts');
    results[variant.id] = {
      status: variant.invariant ? 'expected invariant violation' : 'pass', invariant: variant.invariant,
      exitStatus: result.status,
      generated: Number(counts[1].replaceAll(',', '')), distinct: Number(counts[2].replaceAll(',', '')), remaining: Number(counts[3].replaceAll(',', '')),
    };
    console.log(`${variant.id}: ${results[variant.id].status}`);
  }
  return results;
}

async function implementation(work) {
  const original = runVerification(process.execPath, ['tests/equity-load-ownership.test.mjs']);
  assert.equal(original.status, 0, original.output);
  assert.match(original.output, /tests 36/);
  console.log(original.output.trim());
  const copy = path.join(work, 'implementation');
  // Follow real module dependencies, including shared UI helpers added to the
  // initializer fixture. A pristine isolated run must pass before mutations.
  const fixtureModules = await copyEquityFixtureDependencies(copy);
  const pristine = runVerification(process.execPath, ['tests/equity-load-ownership.test.mjs'], { cwd: copy });
  assert.equal(pristine.status, 0, pristine.output);
  assert.match(pristine.output, /tests 36/);
  checkTap(runVerification(process.execPath, viewportArgs, { cwd: copy }), 2);
  const viewFile = path.join(copy, 'dist/equity-view.js'), source = await readFile(viewFile, 'utf8');
  const changes = [
    {
      id: 'deferred-readiness', from: 'navigation.update();workbench?.update();revealReady();}', to: 'navigation.update();workbench?.update();}',
      failure: /a completed observed render must release the boot shell/,
    },
    {
      id: 'unconfirmed-readiness', from: '}else{navigation.update();workbench?.update();}}', to: '}else{navigation.update();workbench?.update();revealReady();}}',
      failure: /an unconfirmed chart must keep the boot shell/,
    },
    {
      id: 'hidden-paint-failure', from: '.catch(error=>{if(state.funnestMount!==mount||suspended)return;', to: '.catch(error=>{if(state.funnestMount!==mount)return;',
      failure: /a hidden paint failure must not release the boot shell/,
    },
    {
      id: 'stale-paint-failure', from: '.catch(error=>{if(state.funnestMount!==mount||suspended)return;', to: '.catch(error=>{if(suspended)return;',
      failure: /a destroyed chart must not publish its paint failure/,
    },
    {
      id: 'unguarded-prices', from: 'if(token!==generation)return;\n      daily=nextDaily;', to: 'daily=nextDaily;',
      failure: /a revoked stock response must not request a coin archive/,
    },
    {
      id: 'unguarded-projection', from: 'if(token!==generation)return;\n        cachedInputs=', to: 'cachedInputs=',
      failure: /revoked paint continuation must not calculate/,
    },
    {
      id: 'unguarded-coin-error', from: "if(token===generation&&error.name!=='AbortError'){forecastError=", to: "if(error.name!=='AbortError'){forecastError=",
      failure: /revoked underlying work must not clear a newer forecast/,
    },
    {
      id: 'retained-old-projection', from: 'daily=nextDaily;weekly=nextWeekly;cachedInputs=null;projectionCache.clear();projection=null;forecast=null;', to: 'daily=nextDaily;weekly=nextWeekly;cachedInputs=null;projectionCache.clear();',
      failure: /new prices must never be displayed with the previous projection/,
    },
    {
      // Remove only suspension ownership; keep replay and center ownership intact.
      id: 'hidden-ready', from: "state.frame=null;if(suspended||svg.dataset.chartReplayActive==='true'||document.body.dataset.centerTool)return;const series=current();", to: "state.frame=null;if(svg.dataset.chartReplayActive==='true'||document.body.dataset.centerTool)return;const series=current();",
      failure: /a hidden initialization callback must not release the boot shell/,
    },
    {
      id: 'overwritten-range', from: 'state.range=state.rangeTouched&&state.range?{...nextRange,start:state.range.start,end:state.range.end}:null;', to: 'state.range=null;',
      failure: /preserves user interval, scenario and range/,
    },
    {
      id: 'interval-range-reset', from: 'state.range=previous&&target?retargetChartRange(previous,target):target;', to: 'state.range=target;',
      args: viewportArgs, tests: 2, failure: /interval conversion keeps the UTC center within the target grid/,
    },
  ];
  const mutations = {}, mutationExitStatuses = {};
  for (const change of changes) {
    assert.equal(source.split(change.from).length, 2, `Review model/code correspondence and mutation selector: ${change.id}`);
    await writeFile(viewFile, source.replace(change.from, change.to));
    const result = runVerification(process.execPath, change.args || ['tests/equity-load-ownership.test.mjs'], { cwd: copy, expectedStatus: 1 });
    assert.equal(result.status, 1, `${change.id} must finish with an assertion failure`);
    if (change.tests) checkTap(result, change.tests, { fails: true });
    assert.match(result.output, change.failure, `Mutation failed for an unrelated reason: ${change.id}\n${result.output}`);
    mutations[change.id] = 'expected assertion failure';
    mutationExitStatuses[change.id] = result.status;
    console.log(`${change.id}: ${mutations[change.id]}`);
  }
  await writeFile(viewFile, source);
  const restored = runVerification(process.execPath, ['tests/equity-load-ownership.test.mjs'], { cwd: copy });
  assert.equal(restored.status, 0, restored.output);
  checkTap(runVerification(process.execPath, viewportArgs, { cwd: copy }), 2);
  return { tests: 36, viewportTests: 2, original: 'pass', isolated: 'pass', restored: 'pass', fixtureModules, sourceSha256: hash(source), mutations, mutationExitStatuses };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
await prepareTlc();
const work = await mkdtemp(path.join(tmpdir(), 'atlas-equity-proof-'));
try {
  const replay = await implementation(work), model = await models(work);
  const report = {
    tool: { name: 'TLC', release: '1.7.4', jarSha256: TLC_SHA256 },
    bounds: { requestGenerations: 3, intervals: ['daily', 'weekly'], rangeChoices: ['auto', 'custom'], chartFailureRequestGenerations: 2 },
    model, implementation: replay,
    limitations: ['Finite request-state model, not an unbounded proof', 'UI replay injects import, HTTP, animation-frame and DOM boundaries', 'No economic accuracy, visual pixels, browser timing or liveness proof'],
  };
  if (process.argv[2]) await writeFile(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await rm(work, { recursive: true, force: true }); }
}
