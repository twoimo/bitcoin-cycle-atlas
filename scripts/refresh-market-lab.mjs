import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validateSnapshot,validateSeries,realizedVolatility} from '../dist/market-lab-math.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const GDP_URL='https://sdmx.oecd.org/public/rest/data/OECD.SDD.NAD,DSD_NAMAIN1@DF_QNA_EXPENDITURE_GROWTH_OECD,/Q..KOR+USA...B1GQ......G1.?startPeriod=2010-Q1&dimensionAtObservation=AllDimensions&format=csvfile';
const RATE_URL='https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/KOR+USA.M.IR3TIB.PA.....?startPeriod=2010-01&dimensionAtObservation=AllDimensions&format=csvfilewithlabels';
export const PRESERVED_MACRO_VERSION='research-0.3-macro-provenance';
export const MARKET_DEFINITIONS=Object.freeze([
  {id:'spx',symbol:'^GSPC',name:'S&P 500',region:'us',unit:'지수 pt'},
  {id:'nasdaq',symbol:'^IXIC',name:'NASDAQ 종합',region:'us',unit:'지수 pt'},
  {id:'kospi',symbol:'^KS11',name:'KOSPI',region:'kr',unit:'지수 pt'},
  {id:'kosdaq',symbol:'^KQ11',name:'KOSDAQ',region:'kr',unit:'지수 pt'},
  {id:'tqqq',symbol:'TQQQ',name:'TQQQ',region:'us',unit:'USD'},
]);
export function parseCsv(text){
  if(typeof text!=='string'||text.length>8*1024*1024)throw new Error('CSV size/type invalid');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}else if(c==='"'){if(field)throw new Error('CSV quote in unquoted field');quoted=true;}else if(c===','){row.push(field);field='';}else if(c==='\n'){row.push(field.replace(/\r$/,''));if(row.some(x=>x!==''))rows.push(row);row=[];field='';}else field+=c;}
  if(quoted)throw new Error('CSV unfinished quote');if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}if(!rows.length)throw new Error('CSV empty');rows[0][0]=rows[0][0].replace(/^\uFEFF/,'');return rows;
}
const periodEnd=p=>{let m;if((m=/^(\d{4})-Q([1-4])$/.exec(p)))return new Date(Date.UTC(+m[1],+m[2]*3,0)).toISOString().slice(0,10);if((m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(p)))return new Date(Date.UTC(+m[1],+m[2],0)).toISOString().slice(0,10);throw new Error('Unsupported observation period');};
export function parseOecd(text,kind,{now=new Date()}={}){
  if(!['gdp','rate'].includes(kind))throw new Error('Unknown OECD series kind');
  const [header,...records]=parseCsv(text),required=kind==='gdp'?['DATAFLOW','FREQ','REF_AREA','ADJUSTMENT','UNIT_MEASURE','PRICE_BASE','TRANSFORMATION','UNIT_MULT','TIME_PERIOD','OBS_VALUE']:['STRUCTURE_ID','FREQ','REF_AREA','MEASURE','UNIT_MEASURE','UNIT_MULT','TIME_PERIOD','OBS_VALUE'];
  const ix=Object.fromEntries(required.map(k=>{const i=header.indexOf(k);if(i<0||header.filter(h=>h===k).length!==1)throw new Error(`OECD missing/duplicate ${k}`);return[k,i];}));
  const out={us:[],kr:[]},states={us:[],kr:[]};const seen=new Set();
  for(const r of records){const get=k=>r[ix[k]];const region={USA:'us',KOR:'kr'}[get('REF_AREA')];if(!region)throw new Error('Unexpected OECD country');
    if(r.length!==header.length)throw new Error('OECD CSV row width changed');
    if(kind==='gdp'){
      if(!get('DATAFLOW').endsWith('DF_QNA_EXPENDITURE_GROWTH_OECD(1.1)')||get('FREQ')!=='Q'||get('UNIT_MEASURE')!=='PC'||get('PRICE_BASE')!=='L'||get('TRANSFORMATION')!=='G1'||get('ADJUSTMENT')!=='Y')throw new Error('OECD GDP dimensions/version changed');
    }else if(!get('STRUCTURE_ID').endsWith('DF_FINMARK(4.0)')||get('FREQ')!=='M'||get('MEASURE')!=='IR3TIB'||get('UNIT_MEASURE')!=='PA')throw new Error('OECD rate dimensions/version changed');
    if(get('UNIT_MULT')!=='0')throw new Error('OECD unit multiplier changed');
    const date=periodEnd(get('TIME_PERIOD')),key=region+date;if(seen.has(key))throw new Error('OECD duplicate observation');seen.add(key);
    const raw=get('OBS_VALUE');if(raw===''||raw==='..')continue;const value=Number(raw);if(!Number.isFinite(value))throw new Error('OECD invalid value');if(date>=now.toISOString().slice(0,10))continue;
    out[region].push([date,value]);const si=header.indexOf('OBS_STATUS');states[region].push(si>=0?r[si]:null);
  }
  for(const region of ['us','kr']){out[region].sort((a,b)=>a[0].localeCompare(b[0]));validateSeries(out[region]);if(out[region].length<20)throw new Error(`OECD ${region} history insufficient`);}
  return{values:out,states};
}
export function marketDate(time,zone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`;}
export async function commitRefreshFiles({output,body,rawDir,files,failOnKey}={}){
  if(typeof output!=='string'||typeof body!=='string')throw new Error('Commit target is incomplete');
  const stage=rawDir?resolve(dirname(rawDir),`.raw-stage-${process.pid}-${Date.now()}`):null,temp=`${output}.tmp-${process.pid}`,backup=`${output}.bak-${process.pid}`;
  if(stage){await mkdir(stage,{recursive:true});for(const file of files||[])await writeFile(resolve(stage,`${file.key}.txt`),file.text);}
  await mkdir(dirname(output),{recursive:true});await writeFile(temp,body,{flag:'wx'});
  let hadBackup=false,replaced=[];
  try{
    try{await rename(output,backup);hadBackup=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    await rename(temp,output);
    if(stage){
      await mkdir(rawDir,{recursive:true});
      for(const file of files||[]){
        if(file.key===failOnKey)throw new Error(`Injected raw publish failure: ${file.key}`);
        const dest=resolve(rawDir,`${file.key}.txt`),prev=resolve(rawDir,`.prev-${process.pid}-${file.key}.txt`);
        let hadPrev=false;try{await rename(dest,prev);hadPrev=true;}catch(error){if(error.code!=='ENOENT')throw error;}
        try{await rename(resolve(stage,`${file.key}.txt`),dest);}catch(error){if(hadPrev)await rename(prev,dest);throw error;}
        replaced.push({dest,prev,hadPrev});
      }
      await rm(stage,{recursive:true,force:true});
      for(const item of replaced)if(item.hadPrev)await rm(item.prev,{force:true});
    }
    if(hadBackup)await rm(backup,{force:true});
  }catch(error){
    await rm(output,{force:true}).catch(()=>{});
    if(hadBackup)await rename(backup,output).catch(()=>{});
    for(const item of replaced)if(item.hadPrev)await rename(item.prev,item.dest).catch(()=>{});
    if(stage)await rm(stage,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }finally{await rm(temp,{force:true}).catch(()=>{});}
}
export function parseYahoo(payload,symbol,{now=new Date()}={}){
  const result=payload?.chart?.result?.[0];if(payload?.chart?.error||!result||result.meta?.symbol!==symbol||result.meta?.dataGranularity!=='1d')throw new Error('Yahoo symbol/granularity/error mismatch');
  const zone=result.meta.exchangeTimezoneName;if(typeof zone!=='string')throw new Error('Yahoo timezone absent');
  const today=marketDate(+now,zone),timestamps=result.timestamp,closes=result.indicators?.quote?.[0]?.close;
  if(!Array.isArray(timestamps)||!Array.isArray(closes)||timestamps.length!==closes.length)throw new Error('Yahoo daily array mismatch');
  const rows=[];for(let i=0;i<timestamps.length;i++){
    if(!Number.isFinite(timestamps[i]))throw new Error('Yahoo invalid timestamp');const date=marketDate(timestamps[i]*1000,zone);
    // Conservative contract: exclude the entire current local trading date,
    // including after close. Provider regular.end is not an authoritative KRX calendar.
    if(date>=today)continue;if(closes[i]==null)continue;if(typeof closes[i]!=='number'||!Number.isFinite(closes[i])||closes[i]<=0)throw new Error('Yahoo invalid completed close');rows.push([date,closes[i]]);
  }
  validateSeries(rows,{positive:true});if(rows.length<30)throw new Error('Yahoo completed history insufficient');
  return{prices:rows,timezone:zone,priceBasis:'Yahoo quote.close; provider historical split conventions; dividend-adjusted adjclose NOT used',sessionPolicy:'현재 거래소 현지 날짜 전부 제외(장 마감 후에도 다음 현지 날짜부터 편입)',currency:result.meta.currency??null};
}
export async function refreshMarketLab(output=resolve(ROOT,'dist/data/market-lab.json'),{now=new Date(),fetchImpl=globalThis.fetch,rawDir=null,scope='all',replaceMacroDefinitions=false}={}){
  if(!Number.isFinite(+now))throw new Error('Invalid retrieval clock');let previous=null;try{previous=validateSnapshot(JSON.parse(await readFile(output,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!['all','macro'].includes(scope)||scope==='macro'&&!previous)throw new Error('Macro-only refresh needs an existing validated snapshot');
  const generatedAt=now.toISOString(),sources=scope==='macro'?previous.sources.filter(s=>!['us-gdp','kr-gdp','us-rate','kr-rate','kr-realized-vol'].includes(s.id)):[],markets=scope==='macro'?previous.markets:[],warnings=[];const countries={us:'미국',kr:'한국'};let gdp={us:[],kr:[]},rates={us:[],kr:[]},vix=[];
  const rawWrites=[];async function get(url,key){const response=await fetchImpl(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Bitcoin-Cycle-Atlas research (public data; no credentials)'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const raw=await response.text();if(raw.length>8*1024*1024)throw new Error('Response exceeds8MiB');if(rawDir)rawWrites.push({key,text:raw});return{raw,hash:createHash('sha256').update(raw).digest('hex'),contentType:response.headers.get('content-type')};}
  for(const kind of ['gdp','rate']){
    const url=new URL(kind==='gdp'?GDP_URL:RATE_URL);const y=now.getUTCFullYear(),m=now.getUTCMonth();const q=Math.floor(m/3);url.searchParams.set('endPeriod',kind==='gdp'?`${q===0?y-1:y}-Q${q===0?4:q}`:new Date(Date.UTC(y,m,0)).toISOString().slice(0,7));let values={us:[],kr:[]},receipt=null,error=null;
    try{receipt=await get(url.href,`oecd-${kind}`);values=parseOecd(receipt.raw,kind,{now}).values;}catch(e){error=e.message;warnings.push(`OECD ${kind}: ${error}`);}
    if(kind==='gdp')gdp=values;else rates=values;
    for(const region of ['us','kr'])sources.push({id:`${region}-${kind}`,label:`OECD ${countries[region]} ${kind==='gdp'?'실질GDP 전기비(잠정치 포함)':'3개월 단기시장금리(정책금리 아님)'}`,url:url.href,unit:kind==='gdp'?'전기비 %, 비연율화':'연율 %',frequency:kind==='gdp'?'분기':'월',retrievedAt:generatedAt,lastObservation:values[region].at(-1)?.[0]??null,status:error?'error':'ready',releaseTimeKnown:false,...(receipt?{responseSha256:receipt.hash}:{}),...(error?{error}:{})});
  }
  for(const def of scope==='macro'?[]:[...MARKET_DEFINITIONS,{id:'vix',symbol:'^VIX',name:'CBOE VIX',region:'us',unit:'변동성 지수 pt'}]){
    const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.symbol)}?period1=${Date.parse('2010-01-01T00:00:00Z')/1000}&period2=${Math.floor(+now/1000)}&interval=1d&events=history%2Csplits%2Cdividends`;
    let data=null,receipt=null,error=null;try{receipt=await get(url,`yahoo-${def.id}`);data=parseYahoo(JSON.parse(receipt.raw),def.symbol,{now});const old=previous?.markets.find(m=>m.id===def.id);if(old?.prices.length){const dates=new Set(data.prices.map(p=>p[0]));if(old.prices.some(p=>!dates.has(p[0])))throw new Error('Provider would truncate previously observed history');}}catch(e){error=e.message;warnings.push(`${def.symbol}: ${error}`);}
    const source={id:`market-${def.id}`,label:`Yahoo Finance ${def.name} 일봉 종가`,url,unit:def.unit,frequency:'완료 확인 일봉(현재 현지 날짜 제외)',retrievedAt:generatedAt,lastObservation:data?.prices.at(-1)?.[0]??null,status:error?'error':'ready',releaseTimeKnown:false,...(receipt?{responseSha256:receipt.hash}:{}),...(error?{error}:{}),...(data?{priceBasis:data.priceBasis,sessionPolicy:data.sessionPolicy,timezone:data.timezone}:{})};sources.push(source);
    if(def.id==='vix')vix=error?[]:data.prices;else markets.push({...def,sourceId:source.id,prices:error?[]:data.prices,...(data?.timezone?{timezone:data.timezone}:{})});
  }
  if(scope==='macro')vix=previous.regions.us.axes.gamma.values;
  const kospi=markets.find(m=>m.id==='kospi'),krVol=realizedVolatility(kospi?.prices??[]);
  sources.push({id:'kr-realized-vol',label:'KOSPI 종가로 계산한20거래일 실현변동성(심리의 대리지표)',url:sources.find(s=>s.id==='market-kospi').url,unit:'연율 변동성 %',frequency:'일(20거래일 창,252연율화 가정)',retrievedAt:sources.find(s=>s.id==='market-kospi').retrievedAt,lastObservation:krVol.at(-1)?.[0]??null,status:krVol.length?'ready':'error',releaseTimeKnown:false,derivedFrom:'market-kospi',...(krVol.length?{}:{error:'KOSPI 완료 종가가 부족합니다.'})});
  const axis=(sourceId,metric,values,direction,window,minSamples,staleAfterDays)=>({sourceId,metric,values,direction,window,minSamples,staleAfterDays});
  const regions={};for(const region of ['us','kr'])regions[region]={label:region==='us'?'해외 · 미국':'국내 · 한국',axes:{alpha:axis(`${region}-gdp`,'실질GDP 전기비(계절·달력조정)',gdp[region],1,40,20,220),beta:axis(`${region}-rate`,'3개월 단기시장금리(연율)',rates[region],-1,60,36,120),gamma:axis(region==='us'?'market-vix':'kr-realized-vol',region==='us'?'VIX: 심리의 변동성 대리지표':'KOSPI20일 실현변동성: 심리 대리지표',region==='us'?vix:krVol,-1,252,126,14)}};
  const doc=validateSnapshot({schemaVersion:1,generatedAt,modelVersion:'research-0.1',sources,regions,markets,collectionWarnings:warnings,publicationStatus:'local_candidate_unreviewed'});
  // A partial new fetch must not erase a previously valid collection. Its failure
  // receipt remains separate, while the old snapshot retains its original clocks.
  const preserveR3=previous?.modelVersion===PRESERVED_MACRO_VERSION&&replaceMacroDefinitions!==true;if(previous&&warnings.length){await writeFile(`${output}.last-failure.json`,JSON.stringify({attemptedAt:generatedAt,warnings},null,2)+'\n');throw new Error('Partial refresh preserved previous snapshot; see last-failure receipt');}
  let next=doc;if(preserveR3){if(scope==='macro'){await writeFile(`${output}.last-failure.json`,JSON.stringify({attemptedAt:generatedAt,warnings:['R3 macro definitions preserved; successful OECD refresh was not applied']},null,2)+'\n');throw new Error('R3 macro definitions preserved; OECD refresh did not replace snapshot');}next=structuredClone(previous);next.generatedAt=generatedAt;next.markets=markets;const replacementIds=new Set(sources.filter(s=>s.id.startsWith('market-')||s.id==='kr-realized-vol').map(s=>s.id));next.sources=next.sources.filter(s=>!replacementIds.has(s.id)).concat(sources.filter(s=>replacementIds.has(s.id)));if(next.regions?.kr?.axes?.gamma)next.regions.kr.axes.gamma.values=krVol;if(next.regions?.us?.axes?.gamma&&vix.length)next.regions.us.axes.gamma.values=vix;next.collectionWarnings=warnings;next=validateSnapshot(next);}
  await commitRefreshFiles({output,body:JSON.stringify(next)+'\n',rawDir,files:rawWrites});return next;
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
 const raw=process.env.ATLAS_MARKET_RAW_DIR??null;const doc=await refreshMarketLab(undefined,{rawDir:raw,scope:process.argv.includes('--macro-only')?'macro':'all'});console.log(JSON.stringify({generatedAt:doc.generatedAt,sourceReady:doc.sources.filter(s=>s.status==='ready').length,sources:doc.sources.length,warnings:doc.collectionWarnings,markets:doc.markets.map(m=>({id:m.id,rows:m.prices.length,last:m.prices.at(-1)})),axes:Object.fromEntries(Object.entries(doc.regions).map(([k,v])=>[k,Object.fromEntries(Object.entries(v.axes).map(([a,x])=>[a,{rows:x.values.length,last:x.values.at(-1)}]))]))},null,2));
}
