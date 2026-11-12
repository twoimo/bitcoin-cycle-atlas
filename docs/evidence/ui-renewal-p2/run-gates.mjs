#!/usr/bin/env node
// Evidence orchestration only. Each existing native verifier runs unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createWriteStream} from 'node:fs';
import {mkdir, readFile, readlink, realpath, stat, writeFile} from 'node:fs/promises';
import {dirname, extname, relative, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const [repository, expectedHead, destination] = process.argv.slice(2);
assert.ok(repository && destination, 'Usage: node run-gates.mjs REPO FULL_HEAD NEW_OUTPUT');
assert.match(expectedHead || '', /^[a-f0-9]{40}$/);
const root = resolve(repository), site = resolve(root, 'dist'), out = resolve(root, destination);
const browser = process.env.ATLAS_BROWSER_PATH;
assert.ok(browser, 'Set ATLAS_BROWSER_PATH to the native Chrome executable');
for (const key of ['ATLAS_UI_REVIEW','ATLAS_BROWSER_CASE_SCOPE','ATLAS_BROWSER_LANE','ATLAS_BROWSER_SUITE_RUN_ID'])
  assert.ok(!process.env[key], `Do not filter or partition the existing gates: ${key}`);
const git = args => execFileSync('git', args, {cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {schemaVersion:1,kind:'atlas-p2-chrome-native-evidence',request:'P2-CHROME-b16a7c6',
  sourceCommit:expectedHead,startedAt:new Date().toISOString(),productionDeployment:false,
  nativePlatform:process.platform,browser,sourceStable:false,complete:false,qualifies:false,gates:[],failures:[]};
let server, activeChild, ownsOutput = false;

async function sources() {
  assert.equal(git(['rev-parse','HEAD']), expectedHead);
  assert.equal(git(['branch','--show-current']), 'fix/tradingview-responsive-20261110');
  assert.equal(git(['status','--porcelain','--untracked-files=all']), '', 'The candidate must be clean');
  const entries = git(['ls-tree','-r','-z','HEAD','--','dist','apps','packages','scripts','package.json','package-lock.json']).split('\0').filter(Boolean);
  const hashes = {};
  for (const entry of entries) {
    const match = /^(\d+) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(entry);
    assert.ok(match, 'Only committed source blobs belong in this receipt');
    const [, mode, blob, path] = match;
    const bytes = mode === '120000' ? Buffer.from(await readlink(resolve(root,path))) : await readFile(resolve(root,path));
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), blob, `Working bytes differ: ${path}`);
    hashes[path] = sha256(bytes);
  }
  return hashes;
}

async function run(job) {
  const directory = resolve(out,job.id), logPath = resolve(out,job.id+'.run.log');
  const args = job.args(directory), env = {...process.env,...job.env};
  const entry = {id:job.id,required:job.required,command:[process.execPath,...args],
    environment:job.env || {},startedAt:new Date().toISOString(),attempted:0,passed:0,failed:0,qualified:false};
  report.gates.push(entry);
  console.log(JSON.stringify({event:'gate-start',id:job.id,required:job.required}));
  const log = createWriteStream(logPath);
  try {
    activeChild = spawn(process.execPath,args,{cwd:root,env,stdio:['ignore','pipe','pipe']});
    activeChild.stdout.on('data',bytes => log.write(bytes));
    activeChild.stderr.on('data',bytes => log.write(bytes));
    const child = activeChild;
    entry.exit = await new Promise(accept => {
      child.once('error',error => {entry.spawnError=String(error);});
      child.once('close',(code,signal) => accept({code,signal}));
    });
    activeChild = null;
    const bytes = await readFile(resolve(directory,'report.json'));
    const native = JSON.parse(bytes), cases = native.cases || [];
    entry.report = {file:relative(out,resolve(directory,'report.json')),bytes:bytes.length,sha256:sha256(bytes)};
    entry.status = native.status;
    entry.attempted = cases.length;
    entry.passed = cases.filter(item => item.status === 'passed').length;
    entry.failed = cases.filter(item => item.status === 'failed').length;
    entry.unattempted = job.required - entry.attempted;
    entry.failures = native.failures || [];
    entry.error = native.error || native.blockedReason || null;
    entry.qualified = entry.exit.code === 0 && entry.status === 'passed' && entry.attempted === job.required
      && entry.passed === job.required && entry.failures.length === 0 && !entry.error;
    if (job.id === 'axis16') entry.qualified = entry.qualified && native.qualifiesPriceAxisVerification === true;
    if (job.id === 'a9') entry.initialPaintedMs = cases.map(item => item.initial?.ready?.paintedMs).filter(Number.isFinite);
  } catch (error) {entry.error=String(error.stack || error);}
  finally {
    await new Promise(accept => log.end(accept));
    const bytes = await readFile(logPath);entry.log={file:relative(out,logPath),bytes:bytes.length,sha256:sha256(bytes)};
    entry.finishedAt = new Date().toISOString();
    await writeFile(resolve(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({event:'gate-end',id:job.id,attempted:entry.attempted,passed:entry.passed,failed:entry.failed,qualified:entry.qualified}));
  }
}

try {
  await mkdir(dirname(out),{recursive:true});await mkdir(out,{recursive:false});ownsOutput = true;
  report.sourceTree = git(['rev-parse','HEAD^{tree}']);
  report.sourceBefore = await sources();
  const {createEthBrowserCaseSpecs} = await import(pathToFileURL(resolve(root,'scripts/eth-browser-case-specs.mjs')));
  assert.equal(createEthBrowserCaseSpecs().length,53);
  const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
    '.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
  server = createServer(async (request,response) => {
    try {
      assert.ok(['GET','HEAD'].includes(request.method));
      let path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      assert.ok(path.startsWith('/bitcoin-cycle-atlas/'));
      path = path.slice('/bitcoin-cycle-atlas'.length);
      if (path.endsWith('/')) path += 'index.html';
      const file = await realpath(resolve(site,'.'+path)), inside = relative(site,file);
      assert.ok(inside && inside !== '..' && !inside.startsWith('..'+sep) && (await stat(file)).isFile());
      const bytes = await readFile(file);
      response.writeHead(200,{'content-type':mime[extname(file)] || 'application/octet-stream','cache-control':'no-store'});
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch {response.writeHead(404);response.end('not found');}
  });
  await new Promise((accept,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  const base = `http://127.0.0.1:${server.address().port}/bitcoin-cycle-atlas/`;
  const response = await fetch(base), bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status,200);assert.deepEqual(bytes,await readFile(resolve(site,'index.html')));
  report.responsiveServer = {base,status:response.status,indexSha256:sha256(bytes)};
  const jobs = [
    {id:'eth53',required:53,args:() => ['scripts/verify-eth-candidate-browser.mjs'],env:{ATLAS_BROWSER_OUT:resolve(out,'eth53')}},
    ...['BTCUSD','ETHUSD','MSTR','BMNR'].map(symbol => ({id:'responsive-'+symbol,required:11,
      args:() => ['scripts/verify-responsive-workbench-browser.mjs'],env:{ATLAS_RESPONSIVE_BASE_URL:base,
        ATLAS_RESPONSIVE_QUERY:'?legacy=1&page=outlook&symbol='+symbol,ATLAS_RESPONSIVE_HEADING:'bottom',ATLAS_RESPONSIVE_OUT:resolve(out,'responsive-'+symbol)}})),
    {id:'axis16',required:16,args:directory => ['scripts/verify-price-axis-browser.mjs','--browser',browser,'--out',directory]},
    {id:'a9',required:6,args:directory => ['scripts/verify-conference-data-browser.mjs','--profile','fast4g','--encoding','gzip','--out',directory]},
  ];
  // Sequential runs keep one browser's timing and resource use out of another.
  for (const job of jobs) await run(job);
  report.sourceAfter = await sources();
  report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  assert.ok(report.sourceStable,'Source changed during native verification');
  report.complete = report.gates.length === jobs.length && report.gates.every(gate => gate.attempted === gate.required);
  report.qualifies = report.sourceStable && report.complete && report.gates.every(gate => gate.qualified);
} catch (error) {report.failures.push(String(error.stack || error));}
finally {
  activeChild?.kill('SIGTERM');
  if (server?.listening) {server.closeAllConnections();await new Promise(accept => server.close(accept));}
  report.finishedAt = new Date().toISOString();
  if (ownsOutput) await writeFile(resolve(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({event:'complete',sourceStable:report.sourceStable,complete:report.complete,qualifies:report.qualifies,out}));
  process.exitCode = report.qualifies ? 0 : 1;
}
