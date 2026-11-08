const {createHash}=require('node:crypto');
const prefix=Buffer.from('ETH_BROWSER_IMAGE_CHUNK ');
const sizes=['320x740','390x844','768x1024','1024x768','1440x900','1920x1080'];
const keepNames=[...sizes.map(size=>'ui-review-after/wp4-after-'+size+'-chart.png'),
  'ui-review-after/wp4-after-1440x900-replay.png','ui-review-after/wp4-after-1920x1080-replay.png',
  'ui-review-after/ui-entry-mstr-root-1440x900.png','ui-review-after/ui-entry-bmnr-root-1440x900.png',
  ...['320x740','390x844','1440x900'].map(size=>'ui-review-after/wp4-after-'+size+'-legend.png')];
// Exact preserved PNG bytes from the original native receipt. This portable
// table does not read files from the build checkout or trust a name alone.
const preservedRoot='docs/ui-review-20261108/native-4acab/';
const preservedBefore=new Map([
  ['320x740',81087,'5ac0aea41b778f437a923718e626d50008e6d98b9e20e0ba5fc0b54d4df75b6c'],
  ['390x844',99336,'b9c6db22e078f227e1d1dff3c473d7ff758114fb2b5e9c33cac9d7c33ea28323'],
  ['768x1024',189440,'fc092c2ff44f3e190235043a7babb6049ee693f6359b8628f6bc735481a03536'],
  ['1024x768',206753,'17fdceb34bf73e817506b2506053e3362f51b575b166de332afb1df43d67205f'],
  ['1440x900',265021,'c200d3e53c19a7e73c98d4aba98efb3f3a8602ef88825a95500f8cb0a18c4578'],
  ['1920x1080',310341,'ab5436b64d449bb85b73e9a376065a244249af35fca1378390c9c3a9a6d43021'],
].map(([size,bytes,sha256])=>['ui-review-before/wp4-before-'+size+'-chart.png',{bytes,sha256}]));
const images=new Map();
let pending=Buffer.alloc(0),passedOtherBytes=0,keptChunkBytes=0,omittedChunkBytes=0;
process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});
const write=(stream,bytes)=>new Promise((resolve,reject)=>stream.write(bytes,error=>error?reject(error):resolve()));
const log=(event,value)=>write(process.stdout,Buffer.from('ATLAS_UI_PNG_FILTER_'+event+' '+JSON.stringify(value)+'\n'));
async function line(raw){
  if(!raw.subarray(0,prefix.length).equals(prefix)){
    passedOtherBytes+=raw.length;await write(process.stdout,raw);return;
  }
  let chunk;
  try{
    chunk=JSON.parse(raw.subarray(prefix.length).toString('utf8'));
    if(typeof chunk.name!=='string'||!Number.isSafeInteger(chunk.bytes)||chunk.bytes<=0||
      !/^[a-f0-9]{64}$/.test(chunk.sha256)||!Number.isSafeInteger(chunk.total)||chunk.total<=0||
      !Number.isSafeInteger(chunk.index)||chunk.index<0||chunk.index>=chunk.total||typeof chunk.data!=='string')
      throw new Error('Invalid PNG chunk metadata');
    let group=images.get(chunk.name);
    if(!group){
      const preserved=preservedBefore.get(chunk.name),kept=!(preserved?.bytes===chunk.bytes&&preserved.sha256===chunk.sha256);
      group={name:chunk.name,bytes:chunk.bytes,sha256:chunk.sha256,total:chunk.total,kept,chunks:new Map()};images.set(chunk.name,group);
    }
    if(group.bytes!==chunk.bytes||group.sha256!==chunk.sha256||group.total!==chunk.total||group.chunks.has(chunk.index))
      throw new Error('Conflicting or duplicate PNG chunk: '+chunk.name);
    group.chunks.set(chunk.index,chunk.data);
  }catch(error){await write(process.stdout,raw);throw error;}
  if(images.get(chunk.name).kept){keptChunkBytes+=raw.length;await write(process.stdout,raw);}
  else omittedChunkBytes+=raw.length;
}
async function main(){
  await log('START',{version:2,scope:'stdout PNG transport only',keptImageNames:keepNames,
    conditionalOmissions:[...preservedBefore].map(([name,metadata])=>({name,...metadata,preservedArtifact:preservedRoot+name})),
    otherPngPolicy:'forward every PNG except an exact preserved before name, byte count and SHA-256; verify every input image at EOF',
    nonPngPolicy:'preserve every original byte',wrapperAssertions:'unchanged'});
  for await(const chunk of process.stdin){
    pending=pending.length?Buffer.concat([pending,chunk]):chunk;
    let end;
    while((end=pending.indexOf(10))!==-1){const raw=pending.subarray(0,end+1);pending=pending.subarray(end+1);await line(raw);}
  }
  if(pending.length)await line(pending);
  const verified=[];
  for(const group of images.values()){
    if(group.chunks.size!==group.total)throw new Error('Incomplete PNG chunks: '+group.name+' '+group.chunks.size+'/'+group.total);
    const encoded=Array.from({length:group.total},(_,i)=>group.chunks.get(i)).join(''),bytes=Buffer.from(encoded,'base64');
    if(bytes.toString('base64')!==encoded||bytes.length!==group.bytes||createHash('sha256').update(bytes).digest('hex')!==group.sha256)
      throw new Error('PNG byte count or SHA-256 mismatch: '+group.name);
    verified.push({name:group.name,kept:group.kept,bytes:group.bytes,sha256:group.sha256,chunks:group.total,
      ...(!group.kept?{omissionReason:'exact preserved before PNG',preservedArtifact:preservedRoot+group.name}:{})});
  }
  await log('COMPLETE',{version:2,streamStatus:'complete',wrapperVerdict:'see unchanged original receipt and pipeline exit status',
    keptImageNames:verified.filter(x=>x.kept).map(x=>x.name),omittedImageNames:verified.filter(x=>!x.kept).map(x=>x.name),
    missingExpectedKeptImageNames:keepNames.filter(name=>!images.has(name)),passedOtherBytes,keptChunkBytes,omittedChunkBytes,
    inputPngs:verified.length,keptPngs:verified.filter(x=>x.kept).length,omittedPngs:verified.filter(x=>!x.kept).length,
    verifiedOriginalImages:verified});
}
main().catch(async error=>{
  process.exitCode=1;
  try{await write(process.stderr,Buffer.from('ATLAS_UI_PNG_FILTER_ERROR '+JSON.stringify({message:String(error.stack||error)})+'\n'));}catch{}
});
