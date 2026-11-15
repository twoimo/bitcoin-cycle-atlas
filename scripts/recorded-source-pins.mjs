import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const restore=(commit,path)=>`git show ${commit}:${path} > ${path}`;

const PIN_SOURCES=Object.freeze([
  {kind:'ethereum-prospective-record',directories:['research-data/ethereum-prospective-ledger/records','research-data/ethereum-prospective-archive/objects'],
    pins:record=>({commit:record.model.sourceCommit,files:record.model.files}),
    remedy:(commit,path)=>`Issued ETH prospective records are immutable and replay only against these bytes, so restore the file with \`${restore(commit,path)}\` and put new behavior in a module outside the record's graph (see 3ec1e4f9).`},
  {kind:'atlas-forecast-experiments',paths:['dist/data/forecast-ledger/experiments.json'],
    pins:report=>({commit:report.sourceCommit,files:report.experimentSourceFiles}),
    remedy:(commit,path)=>`verify:forecast rejects the ledger until they match. Restore the file with \`${restore(commit,path)}\`, or regenerate with \`npm run build:forecast\` on linux/x64 Node 24.22.2 and commit dist/data/forecast-ledger.`},
]);

async function recordPaths(root,source){
  const paths=[...(source.paths??[])];
  for(const directory of source.directories??[])
    for(const name of (await readdir(resolve(root,directory))).sort())paths.push(directory+'/'+name);
  return paths;
}

export async function recordedSourcePins(root){
  const pins=[];
  for(const source of PIN_SOURCES){
    for(const recordPath of await recordPaths(root,source)){
      let record;
      try{record=JSON.parse(await readFile(resolve(root,recordPath),'utf8'));}catch{continue;}
      if(record?.kind!==source.kind)continue;
      const {commit,files}=source.pins(record);
      for(const [path,hash] of Object.entries(files))pins.push({path,hash,recordPath,remedy:source.remedy(commit,path)});
    }
  }
  return pins;
}

export async function recordedSourceDrift(root){
  const current=new Map(),drift=[];
  for(const pin of await recordedSourcePins(root)){
    if(!current.has(pin.path))current.set(pin.path,await readFile(resolve(root,pin.path)).then(sha,()=>'missing'));
    if(current.get(pin.path)!==pin.hash)drift.push({...pin,current:current.get(pin.path)});
  }
  return drift;
}

export async function assertRecordedSources(root){
  const drift=await recordedSourceDrift(root);
  if(!drift.length)return;
  const byPath=Map.groupBy(drift,pin=>pin.path),lines=[];
  for(const [path,pins] of byPath){
    lines.push(`${path} differs from the bytes committed records pin (sha256 ${pins[0].hash.slice(0,12)}, now ${pins[0].current.slice(0,12)}).`);
    for(const pin of pins)lines.push('  pinned by '+pin.recordPath);
    for(const remedy of new Set(pins.map(pin=>pin.remedy)))lines.push('  '+remedy);
  }
  throw new Error(lines.join('\n'));
}
