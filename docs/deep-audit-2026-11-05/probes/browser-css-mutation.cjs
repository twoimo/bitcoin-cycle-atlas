/** Run the actual native cases with one CSS rule removed in HTTP responses only. */
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(process.env.ATLAS_REPO_ROOT || path.join(__dirname, '../../..'));
const mode = process.argv[2];
const rules = {
  'embedded-toolbar': { file: 'daily-data.css', pattern: '^body\\[data-embedded=true\\] #data-view \\.daily-heading \\{[^\\n]*\\}\\n', replacement: '' },
  'heading-icon-gesture': { file: 'atlas-shell.css', pattern: '  body\\[data-shell=chart\\] \\.atlas-canvas-heading svg\\{touch-action:auto\\}\\n', replacement: '' },
  'rail-scroll': { file: 'atlas-shell.css', pattern: '(  body\\[data-shell=chart\\] \\.workbench-rail\\{[^\\n]*?)overflow-x:hidden;overflow-y:auto;overscroll-behavior-y:contain;scrollbar-width:none', replacement: '$1' },
  'stage-clip': { file: 'atlas-shell.css', pattern: '^body\\[data-center-tool\\] #lab-chart-stage\\{overflow:clip\\}\\n', replacement: '' }
};
assert.ok(rules[mode], 'Choose embedded-toolbar, heading-icon-gesture, rail-scroll or stage-clip.');
assert.ok(process.env.ATLAS_BROWSER_PATH, 'Set ATLAS_BROWSER_PATH; no browser is a blocked run.');
const output = path.resolve(process.env.ATLAS_PROBE_OUT || path.join(root, 'build/css-mutation-' + mode));
const sha = value => createHash('sha256').update(value).digest('hex');
let temporary;
(async () => {
  const originalPath = path.join(root, 'scripts/verify-eth-candidate-browser.mjs');
  const original = await fs.readFile(originalPath, 'utf8'), rule = rules[mode];
  const css = await fs.readFile(path.join(root, 'dist', rule.file), 'utf8');
  assert.equal([...css.matchAll(new RegExp(rule.pattern, 'gm'))].length, 1, 'Mutation must bind exactly one known rule.');
  const changed = css.replace(new RegExp(rule.pattern, 'm'), rule.replacement);
  assert.notEqual(changed, css);
  const metadata = { mode, scope: 'HTTP response substitution only; repository product and harness sources remain unchanged.', path: 'dist/' + rule.file,
    originalCssSha256: sha(css), servedCssSha256: sha(changed), originalRunnerSha256: sha(original), probeSha256: sha(await fs.readFile(__filename)), servedResponses: 0 };
  let runner = original.replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (_, before, relative, after) => before + pathToFileURL(path.resolve(root, 'scripts', relative)).href + after);
  const rootDeclaration = "const root=resolve(fileURLToPath(new URL('..',import.meta.url)));";
  assert.ok(runner.includes(rootDeclaration));
  runner = runner.replace(rootDeclaration, 'const root=' + JSON.stringify(root) + ';');
  const response = "const bytes=await readFile(path);res.writeHead(200,";
  assert.equal(runner.split(response).length, 2, 'Bind the actual static-response read boundary.');
  runner = runner.replace(response, 'let bytes=await readFile(path);if(rel===' + JSON.stringify(rule.file) + '){' +
    'assert.equal(hash(bytes),report.testMutation.originalCssSha256,"Source changed during CSS mutation");' +
    'bytes=Buffer.from(' + JSON.stringify(changed) + ');report.testMutation.servedResponses++;}res.writeHead(200,');
  const main = 'try{await main();}';
  assert.ok(runner.includes(main));
  runner = runner.replace(main, 'report.testMutation=' + JSON.stringify(metadata) + ';report.kind="native-css-negative-control";\n' + main);
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-css-mutation-'));
  const entry = path.join(temporary, 'runner.mjs');
  await fs.writeFile(entry, runner);
  await fs.mkdir(output, { recursive: true });
  const log = await fs.open(path.join(output, 'runner.log'), 'w');
  const child = spawn(process.execPath, [entry], { cwd: root, env: { ...process.env, ATLAS_BROWSER_CASE_SCOPE: 'center-data', ATLAS_BROWSER_OUT: output, ETH_BROWSER_IMAGE_LOG_MODE: 'failures-only' }, stdio: ['ignore', log.fd, log.fd] });
  const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  await log.close();
  const receipt = JSON.parse(await fs.readFile(path.join(output, 'report.json'), 'utf8'));
  assert.ok(receipt.testMutation?.servedResponses > 0, 'The selected CSS override must actually be served.');
  const expectedFailure = { 'embedded-toolbar': 'Embedded action row must fit', 'heading-icon-gesture': 'native heading pan', 'rail-scroll': 'Native navigation never exposed', 'stage-clip': 'outer chart stage|moved \\.atlas-canvas-heading' }[mode];
  const failed = receipt.cases.filter(item=>item.status==='failed');
  const unexpectedFailures = failed.filter(item=>!new RegExp(expectedFailure).test(item.error||''));
  const complete = receipt.cases.length===3&&receipt.sourceIntegrity?.unchangedDuringRun===true;
  const result = { mutation: mode, runnerExitCode: exitCode, status: receipt.status, expectedFailure, complete, unexpectedFailures,
    killed: complete&&failed.length>0&&unexpectedFailures.length===0,
    cases: receipt.cases.map(({ width, height, status, error }) => ({ width, height, status, error })), sourceIntegrity: receipt.sourceIntegrity, testMutation: receipt.testMutation };
  await fs.writeFile(path.join(output, 'mutation-result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if(!complete||unexpectedFailures.length)process.exitCode=1;
  // A surviving mutant is evidence of a coverage limit, never relabeled as killed.
})().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(async () => { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); });
