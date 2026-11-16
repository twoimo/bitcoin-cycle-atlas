import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,realpath,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createP1StaticServer,p1Destinations} from '../scripts/verify-ui-renewal-p1-browser.mjs';

const prefix='/bitcoin-cycle-atlas';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function serve(t,directory) {
  const server=createP1StaticServer(directory);
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  t.after(async()=>{server.closeAllConnections();await new Promise(ok=>server.close(ok));});
  return path=>new Promise((ok,no)=>{
    // A raw path keeps encoded traversal intact instead of normalizing it in
    // the HTTP client before the production server gets to enforce its scope.
    const req=request({hostname:'127.0.0.1',port:server.address().port,path},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>ok({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));
      res.on('error',no);
    });req.on('error',no);req.end();
  });
}
async function fixture(t) {
  const temporary=await realpath(await mkdtemp(resolve(tmpdir(),'atlas-p1-http-')));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const directory=resolve(temporary,'dist'),outside=resolve(temporary,'dist-escape');
  await mkdir(resolve(directory,'market-lab'),{recursive:true});await mkdir(outside);
  const index=Buffer.from('<!doctype html><title>가격 차트</title>\n');
  const market=Buffer.from('<!doctype html><title>시장 분석</title>\n');
  const asset=Buffer.from('body { color: var(--text); }\n');
  await writeFile(resolve(directory,'index.html'),index);
  await writeFile(resolve(directory,'market-lab/index.html'),market);
  await writeFile(resolve(directory,'styles.css'),asset);
  await writeFile(resolve(outside,'secret.txt'),'outside');
  await writeFile(resolve(outside,'index.html'),'outside index');
  return {directory,outside,index,market,asset};
}

test('the actual P1 server serves dist/index.html for root and every unchanged direct route',async t=>{
  const get=await serve(t),index=await readFile(new URL('../dist/index.html',import.meta.url));
  const paths=[prefix+'/',prefix+'/index.html',...p1Destinations.filter(d=>d.path.startsWith('?')).map(d=>prefix+'/'+d.path)];
  const receipts=[];
  for(const path of paths){
    const r=await get(path);
    assert.equal(r.status,200,path);assert.deepEqual(r.bytes,index,path);
    assert.equal(r.headers['content-type'],'text/html;charset=utf-8');assert.equal(r.headers['cache-control'],'no-store');
    receipts.push({path,status:r.status,bytes:r.bytes.length,sha256:sha(r.bytes)});
  }
  t.diagnostic(JSON.stringify({kind:'actual-dist-http',receipts}));
});

test('directory indexes and asset MIME retain their exact original bytes',async t=>{
  const f=await fixture(t),get=await serve(t,f.directory);
  for(const [path,bytes,type] of [[prefix+'/',f.index,'text/html;charset=utf-8'],[prefix+'/market-lab/',f.market,'text/html;charset=utf-8'],[prefix+'/market-lab/index.html',f.market,'text/html;charset=utf-8'],[prefix+'/styles.css?v=kept',f.asset,'text/css']]) {
    const r=await get(path);assert.equal(r.status,200,path);assert.deepEqual(r.bytes,bytes,path);
    assert.equal(r.headers['content-type'],type);assert.equal(r.headers['cache-control'],'no-store');
  }
});

test('prefix confusion, malformed encoding, missing files and encoded sibling traversal stay outside scope',async t=>{
  const f=await fixture(t),get=await serve(t,f.directory);
  for(const path of ['/index.html',prefix+'-escape/index.html',prefix+'/missing.html',prefix+'/%ZZ',prefix+'/%2e%2e%2fdist-escape/secret.txt',prefix+'/%2e%2e%2fdist-escape/']) {
    const r=await get(path);assert.equal(r.status,404,path);assert.equal(r.bytes.toString(),'not found',path);
  }
});

test('realpath still rejects outside file and directory symlinks after an in-scope lexical path',async t=>{
  const f=await fixture(t),get=await serve(t,f.directory);
  await symlink(resolve(f.outside,'secret.txt'),resolve(f.directory,'leaked.txt'));
  await symlink(f.outside,resolve(f.directory,'outside-directory'),'dir');
  for(const path of [prefix+'/leaked.txt',prefix+'/outside-directory/']) {
    const r=await get(path);assert.equal(r.status,404,path);assert.equal(r.bytes.toString(),'not found');
  }
});

test('allowing the root directory does not allow its index symlink to escape the site',async t=>{
  const f=await fixture(t),get=await serve(t,f.directory);
  await rm(resolve(f.directory,'index.html'));await symlink(resolve(f.outside,'index.html'),resolve(f.directory,'index.html'));
  for(const path of [prefix+'/',prefix+'/?page=relay',prefix+'/index.html']) {
    const r=await get(path);assert.equal(r.status,404,path);assert.equal(r.bytes.toString(),'not found');
  }
});
