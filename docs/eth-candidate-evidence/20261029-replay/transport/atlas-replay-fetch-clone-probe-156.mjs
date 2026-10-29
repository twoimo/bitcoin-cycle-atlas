import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';

const root='/workspace/scratch/62c67615b721/bitcoin-cycle-atlas/dist';
const mime={'.js':'text/javascript','.json':'application/json','.html':'text/html'};
const serverEvents=[];
const server=createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://local'),path=requestUrl.pathname;
  const record={url:req.url,start:Date.now()};serverEvents.push(record);
  res.on('finish',()=>record.finished=Date.now());res.on('close',()=>record.closed=Date.now());
  try{
    if(path==='/__probe__.html'){res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end('<!doctype html><html><head><meta charset="utf-8"><title>Replay fetch isolation</title></head><body>Replay fetch isolation</body></html>');return;}
    if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(path==='/__oversize__.bin'){res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});res.end(Buffer.alloc(32000000,32));return;}
    const file=resolve(root,'.'+decodeURIComponent(path)),rel=relative(root,file);
    if(rel==='..'||rel.startsWith('..'+sep))throw Error('escape');
    const bytes=await readFile(file);record.bytes=bytes.length;
    const headers={'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'};
    if(requestUrl.searchParams.get('framing')==='length')headers['Content-Length']=bytes.length;
    res.writeHead(200,headers);res.end(bytes);
  }catch(e){record.error=e.message;res.writeHead(404);res.end('missing');}
});
await new Promise((a,r)=>{server.once('error',r);server.listen(0,'127.0.0.1',a);});
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:'/tmp/atlas-chrome156/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
const report={browser:browser.version(),origin,cases:[]};
try{
  for(const symbol of ['BTCUSD','ETHUSD'])for(const framing of ['chunked','length'])for(let repeat=0;repeat<3;repeat++)for(const mode of ['loader','text','native-clone-monitor']){
    const context=await browser.newContext(),page=await context.newPage(),cdp=await context.newCDPSession(page);
    const item={symbol,mode,framing,repeat,cdp:[],playwright:[]};report.cases.push(item);const urls=new Map();
    const wanted=url=>url?.includes('/data/')&&new URL(url).pathname.endsWith('.json');
    cdp.on('Network.requestWillBeSent',e=>{urls.set(e.requestId,e.request.url);if(wanted(e.request.url))item.cdp.push({event:'request',id:e.requestId,time:e.timestamp,url:e.request.url,initiator:e.initiator});});
    cdp.on('Network.responseReceived',e=>{if(wanted(e.response.url))item.cdp.push({event:'response',id:e.requestId,time:e.timestamp,status:e.response.status,headers:e.response.headers});});
    for(const name of ['loadingFinished','loadingFailed'])cdp.on('Network.'+name,e=>{if(wanted(urls.get(e.requestId)))item.cdp.push({event:name,...e});});
    for(const name of ['requestfinished','requestfailed'])page.on(name,request=>{if(wanted(request.url()))item.playwright.push({event:name,url:request.url(),failure:request.failure()});});
    page.on('pageerror',error=>item.pageError=error.message);
    await cdp.send('Network.enable');await page.goto(origin+'/__probe__.html');
    const archivePath=symbol==='BTCUSD'?'data/btc-daily.json':'data/replay-eth-ohlc.json';
    item.expectedSha256=createHash('sha256').update(await readFile(resolve(root,archivePath))).digest('hex');
    item.result=await page.evaluate(async({symbol,mode,archivePath,framing,repeat})=>{
      const module=await import('./forecast-replay-sources.js');
      const start=performance.now();
      if(mode.startsWith('loader')){
        const controller=new AbortController();window.probeController=controller;
        const loaded=await module.loadReplayPriceArchive(symbol,{fetchImpl:(url,options)=>fetch(url+'?framing='+framing+'&repeat='+repeat,options)});
        return {durationMs:performance.now()-start,sourceHash:loaded.source.sourceHash,observations:loaded.observations.length,through:loaded.observedThrough,signalAborted:controller.signal.aborted};
      }
      const owner=new AbortController();
      const response=await fetch(archivePath+'?framing='+framing+'&repeat='+repeat,{credentials:'omit',redirect:'error',cache:'no-cache',signal:owner.signal});let text,bytes;
      if(mode==='stream-keep-response')window.probeResponse=response;
      if(mode==='text')text=await response.text();
      else if(mode==='native-clone-monitor'){
        const clone=response.clone();bytes=0;
        const body=response.arrayBuffer();
        const monitor=(async()=>{
          const reader=clone.body.getReader();
          try{while(true){const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>16000000){const error=new RangeError('Replay archive exceeds its byte limit');owner.abort(error);throw error;}}}
          finally{reader.releaseLock();}
        })();
        const [buffer]=await Promise.all([body,monitor]);text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
      }
      else if(mode==='native-arraybuffer')text=new TextDecoder('utf-8',{fatal:true}).decode(await response.arrayBuffer());
      else if(mode==='bounded-transform-native'){
        bytes=0;
        const limited=response.body.pipeThrough(new TransformStream({transform(chunk,controller){
          bytes+=chunk.byteLength;if(bytes>16000000)throw new RangeError('Replay archive exceeds its byte limit');controller.enqueue(chunk);
        }}));
        const body=await new Response(limited).arrayBuffer();text=new TextDecoder('utf-8',{fatal:true}).decode(body);
      }
      else{
        const reader=response.body.getReader(),chunks=[];bytes=0;
        while(true){const r=await reader.read();if(r.done)break;chunks.push(r.value);bytes+=r.value.byteLength;}
        if(mode==='stream-closed')await reader.closed;
        if(mode==='stream-yield')await new Promise(resolve=>setTimeout(resolve,0));
        reader.releaseLock();
        const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
        text=new TextDecoder('utf-8',{fatal:true}).decode(all);
      }
      const parsed=await module.parseReplayPriceArchive(symbol,text,{archivePath});
      return {durationMs:performance.now()-start,sourceHash:parsed.source.sourceHash,bytes,observations:parsed.observations.length,through:parsed.observedThrough};
    },{symbol,mode,archivePath,framing,repeat});
    await page.waitForTimeout(70);
    item.hashMatches=item.result.sourceHash===item.expectedSha256;
    console.log(JSON.stringify({symbol,mode,framing,repeat,hashMatches:item.hashMatches,events:item.cdp.filter(e=>e.event==='loadingFinished'||e.event==='loadingFailed')}));
    await context.close();
  }
  const context=await browser.newContext(),page=await context.newPage();await page.goto(origin+'/__probe__.html');
  report.overflow=await page.evaluate(async()=>{
    const owner=new AbortController();let bytes=0,nativeResolved=false,nativeRejected=false;
    const response=await fetch('/__oversize__.bin',{signal:owner.signal}),clone=response.clone();
    const body=response.arrayBuffer().then(value=>{nativeResolved=true;return value;},error=>{nativeRejected=true;throw error;});
    const monitor=(async()=>{const reader=clone.body.getReader();try{while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>16000000){const error=new RangeError('Replay archive exceeds its byte limit');owner.abort(error);throw error;}}}finally{reader.releaseLock();}})();
    try{await Promise.all([body,monitor]);return {unexpectedSuccess:true,bytes,nativeResolved,nativeRejected};}
    catch(error){await body.catch(()=>{});return {error:error.message,bytes,nativeResolved,nativeRejected,aborted:owner.signal.aborted};}
  });
  console.log(JSON.stringify({overflow:report.overflow}));await context.close();
}finally{
  await browser.close();await new Promise(a=>server.close(a));
  report.server=serverEvents.filter(e=>e.url.startsWith('/data/'));
  await writeFile('/tmp/atlas-replay-fetch-clone-probe-156.json',JSON.stringify(report,null,2)+'\n');
}
