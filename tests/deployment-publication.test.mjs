import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile),root=new URL('../',import.meta.url);
const workflow=async name=>readFile(new URL(`.github/workflows/${name}.yml`,root),'utf8');
function step(source,name){
  const label=`      - name: ${name}\n`,start=source.indexOf(label);assert.ok(start>=0,`missing ${name}`);
  const tail=source.slice(start+label.length),end=tail.search(/\n(?:      - |  [a-z][\w-]*:)/);
  return end<0?tail:tail.slice(0,end);
}
function script(block){const offset=block.indexOf('        run: |\n');assert.ok(offset>=0,'step requires a real shell gate');return block.slice(offset+15).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');}
async function temp(t){const dir=await mkdtemp(join(tmpdir(),'atlas-deployment-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test('CI and Pages rebuild the committed publication after tests before packaging the standalone',async()=>{
  const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  for(const key of ['build:forecast','verify:forecast','build:publication','verify:publication'])assert.equal(typeof pkg.scripts[key],'string',key);
  assert.match(pkg.scripts['verify:formal'],/verify-publication-state\.mjs/);
  for(const name of ['ci','pages']){
    const text=await workflow(name),testAt=text.indexOf('run: npm test'),checkAt=text.indexOf('run: npm run verify:forecast');
    const preparation=script(step(text,'Prepare the committed publication and standalone'));
    assert.ok(checkAt>testAt);assert.ok(text.indexOf('name: Prepare the committed publication')>checkAt);
    assert.ok(preparation.indexOf('npm run build:publication')<preparation.indexOf('node scripts/build-standalone.mjs'));
    assert.ok(preparation.indexOf('npm run verify:publication')<preparation.indexOf('node scripts/build-standalone.mjs'));
    assert.match(preparation,/verify-static\.mjs --standalone/);assert.doesNotMatch(preparation,/--preview/);
  }
});

test('actual upload and deploy shell gates reject newer main and a substituted local source',async t=>{
  const directory=await temp(t),bin=join(directory,'bin');await mkdir(bin);
  await writeFile(join(bin,'gh'),'#!/bin/sh\nprintf "%s\\n" "$MOCK_REMOTE_HEAD"\n',{mode:0o755});
  await writeFile(join(bin,'git'),'#!/bin/sh\nprintf "%s\\n" "$MOCK_LOCAL_HEAD"\n',{mode:0o755});
  const expected='a'.repeat(40),env={...process.env,PATH:`${bin}:${process.env.PATH}`,EXPECTED_SOURCE:expected,MOCK_REMOTE_HEAD:expected,MOCK_LOCAL_HEAD:expected,GITHUB_REPOSITORY:'fixture/atlas'};
  for(const file of ['pages','refresh-data'])for(const name of ['Reject a superseded source before upload','Reject a superseded source before deployment']){
    const source=script(step(await workflow(file),name));
    await run('bash',['--noprofile','--norc','-e','-o','pipefail','-c',source],{cwd:directory,env});
    for(const changed of [{MOCK_REMOTE_HEAD:'b'.repeat(40)},{MOCK_LOCAL_HEAD:'c'.repeat(40)}])await assert.rejects(run('bash',['--noprofile','--norc','-e','-o','pipefail','-c',source],{cwd:directory,env:{...env,...changed}}));
  }
});

test('refresh retains judgment capture gating and records actual attempt times before each provider call',async()=>{
  const text=await workflow('refresh-data');
  const capture=step(text,'Save an immutable current calculation snapshot');
  assert.match(capture,/steps\.asset_comparison_refresh\.outcome == 'success'/);
  for(const [name,command] of [['Fetch and validate completed UTC daily observations','refresh-data.mjs'],['Refresh completed exchange candle fallback','refresh-ohlc.mjs'],['Refresh and cross-check historical spot volume','refresh-volume.mjs'],['Refresh completed ETH-USD price candles','refresh-eth.mjs'],['Refresh completed US equity sessions','refresh:equities'],['Refresh the full 18-asset comparison history','refresh:asset-comparison']]){
    const block=step(text,name),body=script(block);
    assert.ok(body.indexOf('attempted_at=')>=0&&body.indexOf('attempted_at=')<body.indexOf(command));
    if(name!=='Fetch and validate completed UTC daily observations')assert.match(block,/continue-on-error: true/);
  }
  assert.match(text,/ATLAS_REFRESH_OUTCOMES/);assert.match(text,/npm run build:forecast/);assert.match(text,/npm run verify:forecast/);
  assert.ok(text.indexOf('npm run build:forecast')<text.indexOf('Test code, fixed research'));
  assert.ok(text.indexOf('Commit only validated data')<text.indexOf('Prepare the committed publication'));
});

test('refresh staged-file guard permits only named forecast indexes and content-addressed JSON',async t=>{
  const directory=await temp(t),body=script(step(await workflow('refresh-data'),'Commit only validated data, derived clock and update metadata'));
  const blocks=[...body.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/g)].map(match=>match[1]);
  const guard=blocks.find(code=>code.includes('const allowed = new Set'));assert.ok(guard);
  await run('git',['init','--quiet'],{cwd:directory});
  const allowed=['dist/data/forecast-ledger/index.json','dist/data/forecast-ledger/evaluation.json','dist/data/forecast-ledger/experiments.json',`dist/data/forecast-ledger/records/${'a'.repeat(64)}.json`,`dist/data/forecast-ledger/snapshots/${'b'.repeat(64)}.json`,'dist/data/judgment-snapshots/2026-10-26T060000000Z-012345abcdef.json'];
  for(const file of allowed){await mkdir(join(directory,file,'..'),{recursive:true});await writeFile(join(directory,file),'{}');}
  await run('git',['add','--',...allowed],{cwd:directory});await run(process.execPath,['--input-type=module','--eval',guard],{cwd:directory});
  for(const file of ['dist/data/forecast-ledger/records/not-a-hash.json','dist/data/forecast-ledger/snapshots/'+ 'c'.repeat(64)+'.js','scripts/injected.mjs']){
    await mkdir(join(directory,file,'..'),{recursive:true});await writeFile(join(directory,file),'{}');await run('git',['add','--',file],{cwd:directory});
    await assert.rejects(run(process.execPath,['--input-type=module','--eval',guard],{cwd:directory}));await run('git',['rm','--cached','--',file],{cwd:directory});
  }
});

test('deployment checks out the prepared commit and confirms its exact public manifest with bounded retries',async()=>{
  for(const name of ['pages','refresh-data']){
    const text=await workflow(name),deploy=text.slice(text.indexOf('\n  deploy:'));
    assert.match(deploy,/ref: \$\{\{ needs\.[\w-]+\.outputs\.source_commit \}\}/);
    assert.match(deploy,/contents: read/);assert.match(deploy,/node-version: '24'/);
    const verify=script(step(deploy,'Confirm the served publication identity'));
    assert.match(verify,/--expected-manifest "\$EXPECTED_MANIFEST"/);assert.match(verify,/--expected-source "\$EXPECTED_SOURCE"/);
    assert.match(verify,/for attempt in 1 2 3 4/);assert.match(verify,/exit 1/);assert.doesNotMatch(verify,/\|\| true|continue-on-error/);
    assert.ok(deploy.indexOf('Reject a superseded source before deployment')<deploy.indexOf('id: deployment'));
  }
});

test('the real public-confirmation loop retries failures at most four times and never drops the prepared identities',async t=>{
  const directory=await temp(t),bin=join(directory,'bin');await mkdir(bin);
  const counter=join(directory,'counter'),log=join(directory,'calls');
  await writeFile(join(bin,'node'),`#!${process.execPath}\nconst fs=require('node:fs');const n=Number(fs.readFileSync(process.env.ATTEMPT_COUNTER,'utf8'))+1;fs.writeFileSync(process.env.ATTEMPT_COUNTER,String(n));fs.appendFileSync(process.env.ARGUMENT_LOG,JSON.stringify(process.argv.slice(2))+'\\n');process.exit(n<=Number(process.env.FAIL_UNTIL)?1:0);\n`,{mode:0o755});
  await writeFile(join(bin,'sleep'),'#!/bin/sh\nexit 0\n',{mode:0o755});
  const env={...process.env,PATH:`${bin}:${process.env.PATH}`,ATTEMPT_COUNTER:counter,ARGUMENT_LOG:log,PAGES_URL:'https://example.com/atlas/',EXPECTED_SOURCE:'a'.repeat(40),EXPECTED_MANIFEST:'b'.repeat(64)};
  for(const name of ['pages','refresh-data'])for(const failUntil of [1,99]){
    await writeFile(counter,'0');await writeFile(log,'');
    const promise=run('bash',['--noprofile','--norc','-e','-o','pipefail','-c',script(step(await workflow(name),'Confirm the served publication identity'))],{cwd:directory,env:{...env,FAIL_UNTIL:String(failUntil)},timeout:2500});
    if(failUntil===99)await assert.rejects(promise);else await promise;
    assert.equal(Number(await readFile(counter,'utf8')),failUntil===99?4:2);
    for(const line of (await readFile(log,'utf8')).trim().split('\n'))assert.deepEqual(JSON.parse(line),['scripts/build-publication.mjs','--verify-url',env.PAGES_URL,'--expected-manifest',env.EXPECTED_MANIFEST,'--expected-source',env.EXPECTED_SOURCE]);
  }
});

test('release recovery only treats an actual missing release as new and preserves existing manifest bytes',async t=>{
  const directory=await temp(t),bin=join(directory,'bin');await mkdir(bin);
  const githubEnv=join(directory,'github-env'),manifest='{"preserved":"exact original bytes"}\n';
  await writeFile(join(bin,'gh'),`#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path'),args=process.argv.slice(2);if(args[0]==='api'){if(process.env.MOCK_STATUS!=='200'){process.stderr.write('HTTP '+process.env.MOCK_STATUS);process.exit(1);}process.stdout.write(JSON.stringify({assets:JSON.parse(process.env.MOCK_ASSETS)}));}else{const destination=args[args.indexOf('--dir')+1];fs.writeFileSync(path.join(destination,'PUBLICATION_MANIFEST.json'),process.env.MOCK_MANIFEST);}\n`,{mode:0o755});
  const block=script(step(await workflow('release'),'Recover a previously preserved release publication'));
  const env={...process.env,PATH:`${bin}:${process.env.PATH}`,RUNNER_TEMP:directory,GITHUB_ENV:githubEnv,GITHUB_REPOSITORY:'fixture/atlas',RELEASE_TAG:'v1.29.0',MOCK_MANIFEST:manifest};
  const invoke=async(status,assets)=>{await writeFile(githubEnv,'');return run('bash',['--noprofile','--norc','-e','-o','pipefail','-c',block],{cwd:directory,env:{...env,MOCK_STATUS:status,MOCK_ASSETS:JSON.stringify(assets)}});};
  await invoke('404',[]);assert.equal(await readFile(githubEnv,'utf8'),'');
  await assert.rejects(invoke('500',[]));
  await assert.rejects(invoke('200',[{name:'Bitcoin_Cycles_Comparison.html'}]));
  await invoke('200',[{name:'PUBLICATION_MANIFEST.json'}]);
  const setting=await readFile(githubEnv,'utf8');assert.ok(setting.startsWith('ATLAS_RELEASE_MANIFEST='));
  assert.equal(await readFile(setting.trim().slice('ATLAS_RELEASE_MANIFEST='.length),'utf8'),manifest);
});

test('release packaging validates and preserves publication before standalone and uploads it first',async()=>{
  const packaging=await readFile(new URL('scripts/package-release.mjs',root),'utf8'),release=await workflow('release');
  assert.ok(packaging.indexOf("'--check'],{cwd:root}")<packaging.indexOf("const html ="));
  assert.ok(packaging.indexOf("await asset('PUBLICATION_MANIFEST.json'")<packaging.indexOf("const html ="));
  assert.match(packaging,/await checkPublication\(preserved,\{directory:path\.join\(root,'dist'\)\}\)/);
  assert.match(packaging,/preserved\.sourceCommit,commit/);assert.match(packaging,/preserved\.sourceTree\?\.status,'clean'/);
  assert.match(packaging,/Forecast_Ledger\.zip/);
  assert.match(release,/for asset in "\$\{assets\[@\]\}"/);assert.doesNotMatch(release,/gh release (?:upload|create)[^\n]*--clobber/);
  assert.doesNotMatch(release,/gh release create[^\n]*"\$\{assets\[@\]\}"/,'serial upload preserves the manifest before any other asset');
});
