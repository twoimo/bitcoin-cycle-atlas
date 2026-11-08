import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createRuntimeDownloader} from '../scripts/bootstrap-cloudflare-build.mjs';
import {cloudflareRuntime as pinned} from '../scripts/cloudflare-build-contract.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const good=Buffer.from('small mock runtime archive'),broken=Buffer.from('incomplete or corrupt archive');
const assets=[
  {name:'Java',...pinned.java,api:'https://api.github.com/repos/adoptium/temurin21-binaries/releases/assets/665758876'},
  {name:'TLC',...pinned.tlc,api:'https://api.github.com/repos/tlaplus/tlaplus/releases/assets/184694200'},
];
const value=(args,flag)=>args[args.indexOf(flag)+1];
async function fixture(t,steps,{wrap=run=>run}={}){
  const root=await mkdtemp(resolve(tmpdir(),'atlas-runtime-download-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const destination=resolve(root,'archive'),calls=[];
  const run=async(command,args,options={})=>{
    assert.equal(command,'curl');
    const step=steps[calls.length];assert.ok(step,'No undeclared transport attempt');
    calls.push({command,args:[...args],options:{...options}});
    const temporary=value(args,'--output');
    await step.before?.(temporary);
    if(step.bytes)await writeFile(temporary,step.bytes);
    if(step.error)throw step.error;
    const marker=args.includes('--write-out')?value(args,'--write-out').replace('%{http_code}',String(step.status??200).padStart(3,'0')):'';
    const result={code:step.code??0,output:(step.output??'')+(step.omitStatus?'':marker)};
    if(result.code&&!options.allowFailure)throw new Error('curl failed ('+result.code+'): '+result.output);
    return result;
  };
  return {destination,calls,download:createRuntimeDownloader(wrap(run))};
}
async function absent(path){await assert.rejects(readFile(path),{code:'ENOENT'});}
// The existing digest argument keeps successful transport mocks small. These
// fixtures are not real runtime bytes; integrity failures below use real SHA256.
const mockDigest=pin=>bytes=>bytes.equals(good)?pin.sha256:sha(bytes);

test('only the pinned Java and TLC assets recover a terminal HTTP 5xx through their official asset API',async t=>{
  for(const pin of assets)await t.test(pin.name,async t=>{
    const f=await fixture(t,[{code:22,status:504,bytes:broken},
      {bytes:good,before:temporary=>absent(temporary)}]);
    await f.download(pin.url,f.destination,pin.sha256,mockDigest(pin));
    assert.equal(f.calls.length,2);
    assert.equal(f.calls[0].args.at(-1),pin.url);assert.equal(f.calls[0].options.allowFailure,true);
    assert.equal(f.calls[1].args.at(-1),pin.api);
    assert.equal(value(f.calls[1].args,'--header'),'Accept: application/octet-stream');
    assert.equal(f.calls[0].args.includes('--header'),false);
    for(const {args,options} of f.calls){
      assert.equal(value(args,'--retry'),'2');assert.equal(value(args,'--connect-timeout'),'20');
      assert.equal(value(args,'--max-time'),'180');assert.equal(options.timeout,undefined);
      assert.ok(args.includes('--fail')&&args.includes('--location'));
    }
    assert.deepEqual(await readFile(f.destination),good);await absent(f.destination+'.download');
  });
});

test('a successful primary transfer is verified without calling the fallback',async t=>{
  const pin=assets[0],f=await fixture(t,[{bytes:good}]);
  await f.download(pin.url,f.destination,pin.sha256,mockDigest(pin));
  assert.equal(f.calls.length,1);assert.deepEqual(await readFile(f.destination),good);
  await absent(f.destination+'.download');
});

test('corrupt primary bytes fail their real committed SHA256 and never trigger an alternate download',async t=>{
  const pin=assets[0],f=await fixture(t,[{bytes:broken}]);
  await assert.rejects(f.download(pin.url,f.destination,pin.sha256),/committed integrity pin/);
  assert.equal(f.calls.length,1);await absent(f.destination);await absent(f.destination+'.download');
});

test('corrupt API bytes still fail the original committed SHA256 and never enter the cache',async t=>{
  const pin=assets[1],f=await fixture(t,[{code:22,status:502,bytes:broken},{bytes:broken}]);
  await assert.rejects(f.download(pin.url,f.destination,pin.sha256),/committed integrity pin/);
  assert.equal(f.calls.length,2);await absent(f.destination);await absent(f.destination+'.download');
});

test('4xx, non-HTTP transfer errors and missing terminal HTTP evidence cannot use the fallback',async t=>{
  const pin=assets[1];
  for(const failure of [
    ...[401,403,404,429].map(status=>({code:22,status})),
    {code:28,status:504},{code:60,status:0},{code:6,status:0},
    {code:22,status:200},{code:22,status:302},{code:22,status:0},
    {code:22,omitStatus:true,output:'curl: (22) The requested URL returned error: 504\n'},
    {code:22,status:404,output:'curl: (22) The requested URL returned error: 504\n'},
    {code:22,status:504,output:'ATLAS_RUNTIME_HTTP_STATUS:504\n'},
  ])await t.test(JSON.stringify(failure),async t=>{
    const f=await fixture(t,[{...failure,bytes:broken}]);
    await assert.rejects(f.download(pin.url,f.destination,pin.sha256),/curl failed/);
    assert.equal(f.calls.length,1);await absent(f.destination);await absent(f.destination+'.download');
  });
});

test('a different URL, altered pin or direct API request retains the original single-download behavior',async t=>{
  const pin=assets[1];
  for(const [url,expected] of [[pin.url,'0'.repeat(64)],[pin.url+'?download=1',pin.sha256],
    [pin.url.replace('/v1.7.4/','/v1.7.5/'),pin.sha256],[pin.url.replace('github.com','github.example'),pin.sha256],
    [pin.api,pin.sha256],[pinned.chrome.url,pinned.chrome.sha256]])await t.test(url+' '+expected.slice(0,8),async t=>{
    const f=await fixture(t,[{code:22,status:504,bytes:broken}]);
    await assert.rejects(f.download(url,f.destination,expected),/curl failed/);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.includes('--write-out'),false);
    assert.deepEqual(f.calls[0].options,{});await absent(f.destination+'.download');
  });
});

test('a failed API transfer remains a failure and removes both attempts temporary output',async t=>{
  const pin=assets[1],f=await fixture(t,[{code:22,status:503,bytes:broken},{code:22,status:403,bytes:broken}]);
  await assert.rejects(f.download(pin.url,f.destination,pin.sha256),/curl failed \(22\)/);
  assert.equal(f.calls.length,2);await absent(f.destination);await absent(f.destination+'.download');
});

test('verified cache bytes bypass transport and corrupt cache bytes must be replaced by a verified transfer',async t=>{
  const cached=await fixture(t,[]);
  await writeFile(cached.destination,good);
  await cached.download(pinned.chrome.url,cached.destination,sha(good));
  assert.equal(cached.calls.length,0);assert.deepEqual(await readFile(cached.destination),good);
  const pin=assets[1],repair=await fixture(t,[{code:22,status:504,bytes:broken},{bytes:good}]);
  await writeFile(repair.destination,broken);
  await repair.download(pin.url,repair.destination,pin.sha256,mockDigest(pin));
  assert.equal(repair.calls.length,2);assert.deepEqual(await readFile(repair.destination),good);
  await absent(repair.destination+'.download');
});

test('unrelated successful downloads retain their custom integrity function and original curl arguments',async t=>{
  const f=await fixture(t,[{bytes:good}]);
  const gitBlob=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  await f.download(pinned.font.url,f.destination,gitBlob(good),gitBlob);
  assert.deepEqual(f.calls[0].args,['--fail','--location','--silent','--show-error','--retry','2','--connect-timeout','20','--max-time','180','--output',f.destination+'.download',pinned.font.url]);
  assert.deepEqual(f.calls[0].options,{});assert.deepEqual(await readFile(f.destination),good);
});

test('both attempts reuse the caller bounded runner without resetting its remaining deadline',async t=>{
  const pin=assets[0],budgets=[];let remaining=5000;
  const f=await fixture(t,[{code:22,status:504},{bytes:good}],{wrap:run=>async(command,args,options)=>{
    assert.equal(options?.timeout,undefined,'The downloader cannot replace the caller remaining budget');
    budgets.push(remaining);remaining-=1200;
    return run(command,args,options);
  }});
  await f.download(pin.url,f.destination,pin.sha256,mockDigest(pin));
  assert.deepEqual(budgets,[5000,3800]);assert.equal(f.calls.length,2);
});

test('an exhausted caller budget or thrown transport failure prevents recovery and cleans the temporary file',async t=>{
  const pin=assets[0],budgetError=new Error('Cloudflare runtime installation exceeded its bound');let calls=0;
  const f=await fixture(t,[{code:22,status:504,bytes:broken}],{wrap:run=>async(...args)=>{
    if(++calls===2)throw budgetError;
    return run(...args);
  }});
  await assert.rejects(f.download(pin.url,f.destination,pin.sha256),error=>error===budgetError);
  assert.equal(calls,2);assert.equal(f.calls.length,1);await absent(f.destination);await absent(f.destination+'.download');
  const transportError=new Error('curl exceeded the runtime bootstrap bound');
  const failed=await fixture(t,[{error:transportError,bytes:broken}]);
  await assert.rejects(failed.download(pin.url,failed.destination,pin.sha256),error=>error===transportError);
  assert.equal(failed.calls.length,1);await absent(failed.destination+'.download');
});
