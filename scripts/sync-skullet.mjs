import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const check=process.argv.includes('--check');
if(process.argv.length!==(check?3:2))throw new Error('Usage: node scripts/sync-skullet.mjs [--check]');
const root=new URL('../',import.meta.url);
const packageRoot=new URL('node_modules/skullet/',root);
const provenance=JSON.parse(await readFile(new URL('tools/skullet/provenance.json',root),'utf8'));
const pkg=JSON.parse(await readFile(new URL('package.json',packageRoot),'utf8'));
if(pkg.version!==provenance.version||pkg.license!==provenance.license)throw new Error('Unexpected Skullet source');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashes={};
async function sync(target,bytes){
  const output=new URL(target,root);
  if(check){
    if(!bytes.equals(await readFile(output)))throw new Error('Skullet file mismatch: '+target);
  }else{
    await mkdir(new URL('.',output),{recursive:true});
    await writeFile(output,bytes);
  }
  hashes[target]=hash(bytes);
}

// Preserve the npm originals independently from Atlas's narrower presentation
// contract. A package with the same version string but different bytes fails.
for(const entry of provenance.upstream){
  const bytes=await readFile(new URL(entry.source,packageRoot));
  if(hash(bytes)!==entry.sha256)throw new Error('Skullet upstream digest mismatch: '+entry.source);
  for(const target of entry.targets)await sync(target,bytes);
}
// This public URL is retained by the immutable boot document and standalone
// packaging. Its contents are an explicitly owned neutral-block adapter.
const adapter=await readFile(new URL(provenance.adapter.source,root));
await sync(provenance.adapter.target,adapter);
console.log(JSON.stringify({version:pkg.version,license:pkg.license,hashes,checked:check}));
