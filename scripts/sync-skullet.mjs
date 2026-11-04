import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const check=process.argv.includes('--check');
const packageRoot=new URL('../node_modules/skullet/',import.meta.url);
const target=new URL('../dist/vendor/skullet/',import.meta.url);
const pkg=JSON.parse(await readFile(new URL('package.json',packageRoot),'utf8'));
if(pkg.version!=='0.0.3'||pkg.license!=='MIT')throw new Error('Unexpected Skullet source');
const entries=[['dist/index.mjs','skullet.js'],['dist/styles.css','styles.css'],['LICENSE','LICENSE']];
await mkdir(target,{recursive:true});
const hashes={};
for(const [from,to]of entries){const bytes=await readFile(new URL(from,packageRoot));hashes[to]=createHash('sha256').update(bytes).digest('hex');if(check){if(!bytes.equals(await readFile(new URL(to,target))))throw new Error('Skullet vendor mismatch: '+to);}else await writeFile(new URL(to,target),bytes);}
console.log(JSON.stringify({version:pkg.version,license:pkg.license,hashes,checked:check}));
