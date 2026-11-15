import {readFile,readdir,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';

export const ETH_REVIEW_SCOPE='research-data/eth-review-scope.json';

async function localRootStylesheets(root){
  const index=await readFile(resolve(root,'dist/index.html'),'utf8');
  const origin=new URL('https://atlas-review.invalid/'),paths=[];
  for(const [tag] of index.matchAll(/<link\b[^>]*>/gi)){
    const attributes=new Map([...tag.matchAll(/\s(rel|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)]
      .map(([,name,double,single,bare])=>[name.toLowerCase(),double??single??bare]));
    if(!(attributes.get('rel')??'').toLowerCase().split(/\s+/).includes('stylesheet')||!attributes.has('href'))continue;
    const url=new URL(attributes.get('href'),origin);
    if(url.origin===origin.origin)paths.push('dist'+decodeURIComponent(url.pathname));
  }
  if(!paths.length)throw new Error('dist/index.html links no local stylesheet; the ETH review inventory cannot be derived');
  return paths;
}

export async function ethReviewInventoryDrift(root){
  const scope=JSON.parse(await readFile(resolve(root,ETH_REVIEW_SCOPE),'utf8'));
  const required=new Set((await readdir(resolve(root,'dist'),{withFileTypes:true}))
    .filter(entry=>entry.isFile()&&/\.(?:js|css|html)$/i.test(entry.name)).map(entry=>'dist/'+entry.name));
  for(const path of await localRootStylesheets(root))required.add(path);
  const seeded=new Set(scope.seedPaths);
  const missing=[...required].filter(path=>!seeded.has(path)).sort();
  const stale=[];
  for(const path of scope.seedPaths){
    const stat=await lstat(resolve(root,path)).catch(()=>null);
    if(!stat?.isFile())stale.push(path);
  }
  return {missing,stale:stale.sort()};
}

export async function assertEthReviewInventory(root){
  const {missing,stale}=await ethReviewInventoryDrift(root);
  if(!missing.length&&!stale.length)return;
  const lines=[ETH_REVIEW_SCOPE+' seedPaths is out of sync with the repository.'];
  if(missing.length)lines.push('Add these paths to seedPaths (every top-level dist/*.js, *.css and *.html file and every stylesheet dist/index.html links is a review seed):',...missing.map(path=>'  + '+path));
  if(stale.length)lines.push('Remove or rename these seedPaths entries; no regular file exists there:',...stale.map(path=>'  - '+path));
  throw new Error(lines.join('\n'));
}
