import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {atlasPages} from '../dist/atlas-navigation.js';

const root=fileURLToPath(new URL('../',import.meta.url)),check=process.argv.includes('--check');
assert(process.argv.length===2||process.argv.length===3&&check,'Usage: node scripts/build-pages.mjs [--check]');
const dist=path.join(root,'dist'),web=path.join(root,'build/pages-web'),base='/bitcoin-cycle-atlas/';
execFileSync(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build','--config',path.join(root,'apps/web/vite.config.ts'),'--base','./','--outDir',web],{cwd:root,stdio:'inherit'});
const expected=new Map();
async function collect(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    assert(!entry.isSymbolicLink(),'Generated Pages files cannot be symlinks');
    if(entry.isDirectory())await collect(path.join(dir,entry.name),prefix+entry.name+'/');
    else expected.set('market-lab/app/'+prefix+entry.name,await readFile(path.join(dir,entry.name)));
  }
}
await collect(web);
const app='market-lab/app/index.html';
expected.set(app,Buffer.from(expected.get(app).toString().replace('<head>',`<head><meta name="atlas-root" content="${base}"><meta name="atlas-static" content="1">`)));
const index=await readFile(path.join(dist,'index.html'),'utf8');
const routes=['market-lab/','market-lab/charts/',...atlasPages.filter(p=>p.tab).map(p=>p.href.slice(1))];
for(const route of routes){
  const depth=route.split('/').filter(Boolean).length,prefix='../'.repeat(depth);
  const html=index.replace(/\b(src|href)=(['"])([^'"]*)\2/g,(all,key,quote,value)=>{
    const next=value.startsWith('./')?prefix+value.slice(2):value.startsWith('?')?prefix+value:value;
    return `${key}=${quote}${next}${quote}`;
  }).replace('<head>',`<head><meta name="atlas-root" content="${base}">`);
  expected.set(route+'index.html',Buffer.from(html));
}
const actual=[];
async function inventory(dir,prefix='market-lab/'){
  for(const e of await readdir(dir,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
    assert(!e.isSymbolicLink(),'No symlinks in Pages artifacts');
    if(e.isDirectory())await inventory(path.join(dir,e.name),prefix+e.name+'/');else actual.push(prefix+e.name);
  }
}
await inventory(path.join(dist,'market-lab'));
if(check){
  assert.deepEqual(actual.sort(),[...expected.keys()].sort(),'Pages artifact file coverage changed');
  for(const [name,bytes]of expected)assert.deepEqual(await readFile(path.join(dist,name)),bytes,'Stale generated Pages file: '+name);
}else{
  // Only this dedicated generated tree is owned by this command.
  await rm(path.join(dist,'market-lab'),{recursive:true,force:true});
  for(const [name,bytes]of expected){const target=path.join(dist,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes);}
}
console.log(JSON.stringify({status:check?'verified':'built',base,files:expected.size,routes:routes.length,mode:'saved-data-static-frontend'}));
