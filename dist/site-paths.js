/** UI transport paths only. Calculation modules never depend on hosting mode. */
export function atlasRootPath(doc=globalThis.document){
  const declared=doc?.querySelector('meta[name="atlas-root"]')?.getAttribute('content');
  if(declared!==undefined&&declared!==null){
    if(!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(declared)||declared.includes('/../')||declared.includes('/./'))throw new Error('Invalid Atlas site root');
    return declared;
  }
  const url=new URL(import.meta.url);
  return /^https?:$/.test(url.protocol)&&!url.pathname.includes('/@fs/')&&url.pathname.endsWith('/site-paths.js')?url.pathname.slice(0,-'site-paths.js'.length):'/';
}
export function atlasSitePath(path,root=atlasRootPath()){
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\\\r\n]/.test(path)||path.split(/[?#]/)[0].split('/').some(part=>part==='.'||part==='..'))throw new Error('Invalid Atlas resource path');
  return root+path.slice(1);
}
export const isAtlasStatic=(doc=globalThis.document)=>doc?.querySelector('meta[name="atlas-static"]')?.getAttribute('content')==='1';

export function atlasResourcePath(relative,doc=globalThis.document){
  return doc?.querySelector('meta[name="atlas-root"]') ? atlasSitePath('/'+relative,atlasRootPath(doc)) : './'+relative;
}
