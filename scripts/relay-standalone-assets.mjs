import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const mediaTypes={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'};
const array=value=>Array.isArray(value)?value:[];

/** Collect only image references actually used by the preserved relay payload. */
export function relayLocalImagePaths(data){
  const references=array(data?.rooms).flatMap(room=>[
    ...array(room.articles).flatMap(article=>array(article.images).map(image=>typeof image==='string'?image:image?.src)),
    ...array(room.editions).flatMap(edition=>array(edition.pages).map(page=>page?.image)),
  ]).filter(Boolean);
  const paths=new Set();
  for(const value of references){
    if(typeof value!=='string')throw new Error('Relay image references must be strings');
    // Existing absolute/data URLs remain authored source references. Packaging
    // never downloads an external image or rewrites the original relay JSON.
    if(/^(?:https?:\/\/|data:image\/)/i.test(value))continue;
    if(!value.startsWith('data/relay/')||!/^[A-Za-z0-9_./-]+$/.test(value)||
      value.split('/').some(part=>!part||part==='.'||part==='..')||!mediaTypes[extname(value).toLowerCase()]){
      throw new Error('Unsafe local relay image path: '+value);
    }
    paths.add(value);
  }
  return [...paths].sort();
}

export async function readRelayStandaloneAssets(dist,data){
  const paths=relayLocalImagePaths(data),images={};let bytes=0;
  if(!paths.length)return {images,bytes};
  const directory=await realpath(resolve(dist,'data/relay'));
  for(const path of paths){
    const file=await realpath(resolve(dist,path));
    if(!file.startsWith(directory+sep)||!(await stat(file)).isFile())throw new Error('Relay image escapes its data directory: '+path);
    const body=await readFile(file);bytes+=body.length;
    images[path]=`data:${mediaTypes[extname(path).toLowerCase()]};base64,${body.toString('base64')}`;
  }
  return {images,bytes};
}
