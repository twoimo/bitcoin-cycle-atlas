import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,symlink,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {createEthereumResearchSnapshot,rebuildEthereumResearchPrices,planEthereumResearchPriceRequest,
  ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {validateEthereumCommittedBase} from '../scripts/ethereum-prospective-base.mjs';
import {ETH_BASE_ROLLOVER_POLICY,buildEthereumBaseRolloverCandidate} from '../scripts/ethereum-base-rollover-core.mjs';
import {prepareEthereumBaseRollover,parseEthereumBaseRolloverArguments} from '../scripts/prepare-ethereum-base-rollover.mjs';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';

const root=resolve(import.meta.dirname,'..'),DAY=86400000;
const sha=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
const json=value=>canonicalForecastJson(value)+'\n';
const run=promisify(execFile);
async function temp(t){const path=await mkdtemp(resolve(tmpdir(),'atlas-rollover-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}
async function source(t,snapshot){const repositoryRoot=await temp(t),snapshotPath=resolve(repositoryRoot,'snapshot.json');await writeFile(snapshotPath,json(snapshot));return {repositoryRoot,snapshotPath};}
const build=snapshot=>buildEthereumBaseRolloverCandidate({snapshot,preparedAt:'2026-10-29T00:00:00.000Z'});

test('verified raw snapshot produces deterministic completed prices and preserves its input bytes',async()=>{
  const f=await prospectiveFixture(),original=json(f.snapshot),a=await build(f.snapshot),b=await build(f.snapshot);
  assert.equal(a.candidateText,b.candidateText);assert.equal(a.receiptText,b.receiptText);
  assert.equal(json(f.snapshot),original);
  const candidate=parseEthArchive(JSON.parse(a.candidateText));
  assert.deepEqual(candidate.candles.map(row=>[row.date.slice(0,10),row.close]),f.snapshot.primaryPrices);
  assert.equal(a.report.candidate.sha256,sha(a.candidateText));assert.equal(a.report.candidate.gitBlobSha,blob(a.candidateText));
  assert.equal(a.report.candidate.committed,false);assert.equal(a.report.operatingBaseChanged,false);
  assert.equal(a.report.newForecastRecords,0);assert.equal(a.report.newObservations,0);assert.equal(a.report.newCalibrationCases,0);
  assert.equal(a.report.releaseAuthorized,false);assert.equal(a.report.productionPromoted,false);
});

test('all unqueried OHLCV and effective collection clocks survive the rollover',async()=>{
  const f=await prospectiveFixture(),result=await build(f.snapshot);
  const before=parseEthArchive(JSON.parse(f.base.text)),after=parseEthArchive(JSON.parse(result.candidateText));
  const afterByTime=new Map(after.candles.map(row=>[row.time,row]));
  for(const old of before.candles.filter(row=>row.time<f.snapshot.request.requestedStart)){
    const fresh=afterByTime.get(old.time);
    for(const field of ['time','date','open','high','low','close','volume'])assert.equal(fresh[field],old[field]);
    assert.equal(fresh.retrievedAt,old.retrievedAt??before.retrievedAt);
  }
  assert.equal(result.report.changes.retainedCandles,793);
  assert.equal(result.report.changes.reacquiredUnchangedCandles,7);
  assert.equal(result.report.changes.addedCandles,1);assert.equal(result.report.changes.removedCandles,0);
});

test('changed overlap values are retained as explicit before and after revisions',async()=>{
  const f=await prospectiveFixture(),raw=JSON.parse(f.tail.text);raw.at(-1)[4]=105;
  const snapshot=await createEthereumResearchSnapshot({base:f.base,tail:{...f.tail,text:JSON.stringify(raw)}});
  const result=await build(snapshot),revisions=result.report.changes.revisions;
  assert.equal(revisions.length,1);assert.equal(revisions[0].before.close,100);assert.equal(revisions[0].after.close,105);
  assert.equal(result.report.changes.revisedCandles,1);assert.equal(result.report.changes.reacquiredUnchangedCandles,6);
});

test('candidate moves the exact request boundary while retaining the seven-day overlap and frozen limits',async()=>{
  const f=await prospectiveFixture(),result=await build(f.snapshot),capacity=result.report.capacity;
  assert.equal(capacity.requestBoundaryExtendedDays,1);assert.deepEqual(capacity.requestPolicy,ETH_PROSPECTIVE_PRICE_POLICY);
  assert.equal(capacity.limitsChanged,false);
  const candidate=parseEthArchive(JSON.parse(result.candidateText));
  assert.equal(capacity.nextRequest.requestedStart,candidate.requestedEnd-7*86400);
  for(const [text,boundary]of [[f.base.text,capacity.previous],[result.candidateText,capacity.candidate]]){
    assert.doesNotThrow(()=>planEthereumResearchPriceRequest(text,boundary.lastAcceptedRequestUtcDate+'T23:59:59.999Z'));
    assert.throws(()=>planEthereumResearchPriceRequest(text,boundary.firstRejectedRequestUtcDate+'T00:00:00.000Z'),/290 days/);
  }
});

test('candidate can enter the existing committed-base validator and another real reconstruction contract',async()=>{
  const f=await prospectiveFixture(),result=await build(f.snapshot),bytes=Buffer.from(result.candidateText);
  const accepted=validateEthereumCommittedBase({workingBytes:bytes,committedBytes:bytes,sourceCommit:'d'.repeat(40),
    sourceTree:'e'.repeat(40),gitBlobSha:blob(bytes),collectedAt:f.snapshot.informationCutoffAt});
  assert.equal(accepted.receipt.lastDate.slice(0,10),f.snapshot.asOf);
  const began=new Date(Date.parse(f.tail.requestStartedAt)+DAY).toISOString(),completed=new Date(Date.parse(began)+1000).toISOString();
  const request=planEthereumResearchPriceRequest(result.candidateText,began);
  const raw=Array.from({length:(request.requestedEnd-request.requestedStart)/86400},(_,i)=>[request.requestedStart+i*86400,90,110,100,100,10]).reverse();
  const next=await createEthereumResearchSnapshot({base:accepted.base,tail:{text:JSON.stringify(raw),requestStartedAt:began,bodyCompletedAt:completed,sourceUrl:request.sourceUrl}});
  assert.equal(next.primaryPrices.length,f.snapshot.primaryPrices.length+1);
  assert.equal(next.base.sourceHash,result.report.candidate.sha256);
});

test('real preserved seed produces every stored close and retains pre-existing historical gaps',async()=>{
  const dir=resolve(root,'research-data/ethereum-prospective-ledger'),index=JSON.parse(await readFile(resolve(dir,'index.json')));
  const path=resolve(dir,index.entries[0].snapshotPath),bytes=await readFile(path),snapshot=JSON.parse(bytes);
  const result=await build(snapshot),candidate=parseEthArchive(JSON.parse(result.candidateText));
  assert.deepEqual(candidate.candles.map(row=>[row.date.slice(0,10),row.close]),snapshot.primaryPrices);
  assert.equal(result.report.changes.addedCandles,1);assert.equal(result.report.changes.revisedCandles,0);
  assert.equal(candidate.gapCount,2);
  assert.equal(result.report.capacity.previous.lastAcceptedRequestUtcDate,'2027-08-05');
  assert.equal(result.report.capacity.candidate.lastAcceptedRequestUtcDate,'2027-08-06');
  assert.deepEqual(await readFile(path),bytes);
  assert.deepEqual(JSON.parse(result.candidateText).intervals,JSON.parse(snapshot.base.text).intervals);
  assert.equal(result.report.candidate.intervalsRefreshed,false);
});

test('each altered raw input, source identity, output and recorded clock is rejected',async t=>{
  const f=await prospectiveFixture();
  const changes=[
    ['id',s=>s.id='0'.repeat(64)],['base text',s=>s.base.text+=' '],['base hash',s=>s.base.sourceHash='0'.repeat(64)],
    ['base blob',s=>s.base.gitBlobSha='0'.repeat(40)],['tail text',s=>s.tail.text+=' '],['tail URL',s=>s.tail.sourceUrl+='&extra=1'],
    ['tail hash',s=>s.tail.sourceHash='0'.repeat(64)],['prices',s=>s.primaryPrices[0][1]+=1],
    ['collection clock',s=>s.tail.bodyCompletedAt=s.tail.requestStartedAt],['publication claim',s=>s.historicalVintagesProven=true],
  ];
  for(const [label,change]of changes)await t.test(label,async()=>{const s=structuredClone(f.snapshot);change(s);await assert.rejects(build(s));});
});

test('rehashing a snapshot cannot promote missing or unfinished raw candles',async t=>{
  const f=await prospectiveFixture();
  for(const [label,change]of [['missing candle',rows=>rows.pop()],['unfinished candle',rows=>{rows[0][0]+=86400;}],
    ['bad daily OHLC',rows=>{rows[0][1]=999;}],['duplicate candle',rows=>{rows.push(rows[0]);}]]){
    await t.test(label,async()=>{
      const s=structuredClone(f.snapshot),raw=JSON.parse(s.tail.text);change(raw);s.tail.text=JSON.stringify(raw);
      const {id,...body}=s;s.id=await forecastHash(body);await assert.rejects(build(s));
    });
  }
});

test('future collection and acquisition beyond the frozen deadline cannot become candidates',async()=>{
  const f=await prospectiveFixture();
  await assert.rejects(buildEthereumBaseRolloverCandidate({snapshot:f.snapshot,preparedAt:f.tail.requestStartedAt}),/future acquisition/);
  const snapshot=await createEthereumResearchSnapshot({base:f.base,tail:{...f.tail,bodyCompletedAt:new Date(Date.parse(f.tail.requestStartedAt)+30001).toISOString()}});
  await assert.rejects(build(snapshot),/request deadline/);
});

test('a candidate that grows beyond the existing committed-base budget is refused',async()=>{
  const f=await prospectiveFixture(),base=JSON.parse(f.base.text);
  base.padding='x'.repeat(ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes-Buffer.byteLength(f.base.text)-100);
  const baseText=JSON.stringify(base),snapshot=await createEthereumResearchSnapshot({base:{...f.base,text:baseText,gitBlobSha:blob(baseText)},tail:f.tail});
  await assert.rejects(build(snapshot),/committed-base byte limit/);
});

test('filesystem preparation is idempotent, preserves originals and leaves only a complete artifact directory',async t=>{
  const f=await prospectiveFixture(),args=await source(t,f.snapshot),before=await readFile(args.snapshotPath);
  const a=await prepareEthereumBaseRollover(args),path=resolve(args.repositoryRoot,a.outputDirectory);
  assert.equal(a.status,'candidate-prepared');assert.deepEqual((await readdir(path)).sort(),['candidate.json','receipt.json']);
  const initial=await Promise.all(['candidate.json','receipt.json'].map(name=>readFile(resolve(path,name))));
  const b=await prepareEthereumBaseRollover({...args,clock:()=> '2026-10-30T00:00:00.000Z'});
  assert.equal(b.status,'candidate-reused');
  const final=await Promise.all(['candidate.json','receipt.json'].map(name=>readFile(resolve(path,name))));
  assert.deepEqual(final,initial);assert.deepEqual(await readFile(args.snapshotPath),before);
  assert.deepEqual(await readdir(resolve(args.repositoryRoot,ETH_BASE_ROLLOVER_POLICY.outputParent)),[f.snapshot.id]);
});

test('invalid snapshot creates no output and conflicting artifacts are never replaced',async t=>{
  const f=await prospectiveFixture(),bad=structuredClone(f.snapshot);bad.id='0'.repeat(64);
  const invalid=await source(t,bad);await assert.rejects(prepareEthereumBaseRollover(invalid));
  await assert.rejects(readdir(resolve(invalid.repositoryRoot,'build')),error=>error.code==='ENOENT');
  const args=await source(t,f.snapshot),result=await prepareEthereumBaseRollover(args),file=resolve(args.repositoryRoot,result.outputDirectory,'candidate.json');
  await writeFile(file,'conflicting original\n');
  await assert.rejects(prepareEthereumBaseRollover(args),/Refusing to replace/);
  assert.equal(await readFile(file,'utf8'),'conflicting original\n');
  assert.deepEqual(await readdir(resolve(args.repositoryRoot,ETH_BASE_ROLLOVER_POLICY.outputParent)),[f.snapshot.id]);
});

test('incomplete existing destinations stay intact instead of being repaired into a false success',async t=>{
  const f=await prospectiveFixture(),args=await source(t,f.snapshot),path=resolve(args.repositoryRoot,ETH_BASE_ROLLOVER_POLICY.outputParent,f.snapshot.id);
  await mkdir(path,{recursive:true});await writeFile(resolve(path,'candidate.json'),'partial');
  await assert.rejects(prepareEthereumBaseRollover(args),/conflicting contents/);
  assert.deepEqual(await readdir(path),['candidate.json']);assert.equal(await readFile(resolve(path,'candidate.json'),'utf8'),'partial');
});

test('input symbolic links, output parent links and artifact links are refused',async t=>{
  const f=await prospectiveFixture(),args=await source(t,f.snapshot),link=resolve(args.repositoryRoot,'link.json');
  await symlink(args.snapshotPath,link);await assert.rejects(prepareEthereumBaseRollover({...args,snapshotPath:link}),/symbolic links/);
  const linked=await source(t,f.snapshot),outside=await temp(t);
  await symlink(outside,resolve(linked.repositoryRoot,'build'));await assert.rejects(prepareEthereumBaseRollover(linked),/symbolic links/);
  assert.deepEqual(await readdir(outside),[]);
  const artifacts=await source(t,f.snapshot),saved=await prepareEthereumBaseRollover(artifacts),file=resolve(artifacts.repositoryRoot,saved.outputDirectory,'receipt.json');
  const external=resolve(outside,'receipt.json');await writeFile(external,await readFile(file));await rm(file);await symlink(external,file);
  await assert.rejects(prepareEthereumBaseRollover(artifacts),/symbolic links/);
});

test('a linked destination or a source inside the destination cannot be published over',async t=>{
  const f=await prospectiveFixture(),args=await source(t,f.snapshot),parent=resolve(args.repositoryRoot,ETH_BASE_ROLLOVER_POLICY.outputParent),outside=await temp(t);
  await mkdir(parent,{recursive:true});await symlink(outside,resolve(parent,f.snapshot.id));
  await assert.rejects(prepareEthereumBaseRollover(args),/symbolic link/);assert.deepEqual(await readdir(outside),[]);
  const nestedRoot=await temp(t),destination=resolve(nestedRoot,ETH_BASE_ROLLOVER_POLICY.outputParent,f.snapshot.id);
  await mkdir(destination,{recursive:true});const nestedSource=resolve(destination,'source.json');await writeFile(nestedSource,json(f.snapshot));
  await assert.rejects(prepareEthereumBaseRollover({repositoryRoot:nestedRoot,snapshotPath:nestedSource}),/contain its preserved source/);
  assert.deepEqual(await readdir(destination),['source.json']);
});

test('concurrent preparations produce one complete immutable candidate or a lock error',async t=>{
  const f=await prospectiveFixture(),args=await source(t,f.snapshot);
  const results=await Promise.allSettled([prepareEthereumBaseRollover(args),prepareEthereumBaseRollover(args)]);
  assert.ok(results.some(r=>r.status==='fulfilled'));
  for(const result of results)if(result.status==='rejected')assert.match(result.reason.message,/already owns/);
  assert.equal((await prepareEthereumBaseRollover(args)).status,'candidate-reused');
  assert.deepEqual(await readdir(resolve(args.repositoryRoot,ETH_BASE_ROLLOVER_POLICY.outputParent)),[f.snapshot.id]);
});

test('CLI rejects unsupported destinations and reports real failures with a nonzero exit',async()=>{
  assert.deepEqual(parseEthereumBaseRolloverArguments(['--snapshot','source.json']),{snapshotPath:'source.json'});
  for(const args of [[],['--snapshot'],['--snapshot','x','--output','dist'],['--snapshot','--help'],['--help','anything']])
    assert.throws(()=>parseEthereumBaseRolloverArguments(args),/Usage/);
  const help=await run(process.execPath,['scripts/prepare-ethereum-base-rollover.mjs','--help'],{cwd:root});
  assert.match(help.stdout,/without replacing the operating base/);
  await assert.rejects(run(process.execPath,['scripts/prepare-ethereum-base-rollover.mjs','--snapshot','not-present.json'],{cwd:root}),error=>{
    assert.equal(error.code,1);const result=JSON.parse(error.stderr.trim());assert.equal(result.status,'failed');assert.equal(result.releaseAuthorized,false);return true;
  });
});
