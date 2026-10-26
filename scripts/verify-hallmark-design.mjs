#!/usr/bin/env node
// Hallmark is CI tooling only. Read committed sources; write solely under build/hallmark.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,rm,cp,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const PIN='0c1ed40e1b9b6c76f5621d087737dc57f174b51e';
const args=process.argv.slice(2),options={baseline:'build/hallmark-baseline',out:'build/hallmark'};
for(let i=0;i<args.length;i++){
  const key=args[i];
  if(!['--baseline','--out'].includes(key)||!args[i+1])throw new Error('Usage: node scripts/verify-hallmark-design.mjs [--baseline path] [--out build/path]');
  options[key.slice(2)]=args[++i];
}
const BASELINE=resolve(ROOT,options.baseline),OUT=resolve(ROOT,options.out);
assert.ok(OUT.startsWith(join(ROOT,'build')+sep),'Output must stay under build/');
assert.ok(BASELINE!==OUT&&!BASELINE.startsWith(OUT+sep),'Baseline checkout must be outside output');
const WORK=join(OUT,'work'),DIST=join(WORK,'dist'),REPORTS=join(OUT,'reports');
const UPSTREAM=join(ROOT,'tools/hallmark/upstream'),PATCHED=join(OUT,'tool');
const ORIGIN='http://127.0.0.1:4177',BASE='/bitcoin-cycle-atlas/';
const ROUTES=[
  {name:'btc',path:'?symbol=BTCUSD&granularity=daily&type=line'},
  {name:'eth',path:'?symbol=ETHUSD&granularity=daily&type=line'},
  {name:'bmnr',path:'?symbol=BMNR&granularity=daily&type=line'},
  {name:'mstr',path:'?symbol=MSTR&granularity=daily&type=line'},
  {name:'data',path:'?page=data'},
  {name:'evidence',path:'?page=evidence'},
  {name:'compare',path:'?page=compare&legacy=1'},
  {name:'mobile-preview',path:'mobile-preview.html'}
].map(route=>({...route,url:ORIGIN+BASE+route.path}));
const URLS=ROUTES.map(route=>route.url),started=Date.now(),deadline=started+600000;
const receipt={schemaVersion:1,startedAt:new Date(started).toISOString(),baselineCommit:PIN,
  upstreamCommit:'7ec868225c6caa040558c321ee0fefa0e73f83a8',scope:'app',genre:'modern-minimal',
  auditInputs:{static:['dist'],render:['dist/styles.css',...URLS],note:'The render pass also runs static gates on styles.css so upstream can read the explicit reworded stamp for kept checks. Its totals are not directly comparable with earlier URL-only passes.'},
  origin:ORIGIN,workPath:relative(ROOT,WORK),routes:ROUTES,phases:[],readiness:[],integrityErrors:[],
  designGate:{status:'not-run',fails:0,reflex:0},sourceReadOnly:null,
  limits:{totalMilliseconds:600000,staticMilliseconds:60000,renderMilliseconds:270000},
  limitations:['Static Hallmark does not traverse JavaScript ES imports.','URL render checks initial route state, not every dialog or interactive state.','Existing model, data and interaction tests remain required.','Optional remote application fonts are not rewritten; upstream records fallback warnings.']};
let server=null,activePhase='',activeChild=null;
const requestCounts=new Map();
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(dir,...a)=>execFileSync('git',['-C',dir,...a],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024}).trim();
const errorText=e=>String(e?.stack||e);
function remainingBudget(maximum=30000){
  const left=deadline-Date.now()-500;
  if(left<=0)throw new Error('Hallmark audit deadline exceeded');
  return Math.min(maximum,left);
}
function integrity(condition,message){if(!condition)receipt.integrityErrors.push(message);return !!condition;}
async function json(path,value){await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}
async function inventory(dir,prefix=''){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const name=prefix+entry.name;
    assert.ok(!entry.isSymbolicLink(),'No symlink in audit source: '+name);
    if(entry.isDirectory())out.push(...await inventory(join(dir,entry.name),name+'/'));
    else if(entry.isFile())out.push(name);
  }
  return out.sort();
}
async function sourceProof(dir){
  const commit=git(dir,'rev-parse','HEAD');
  const raw=execFileSync('git',['-C',dir,'ls-tree','-rz','HEAD','--','dist','research-data','tools/hallmark','scripts/verify-hallmark-design.mjs','.github/workflows/hallmark-design.yml'],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});
  let files=0,bytes=0;const aggregate=createHash('sha256');
  for(const item of raw.split('\0').filter(Boolean)){
    const split=item.indexOf('\t'),[mode,type,expected]=item.slice(0,split).split(' '),path=item.slice(split+1);
    assert.equal(type,'blob');assert.ok(['100644','100755'].includes(mode),'Unexpected source mode: '+path);
    const data=await readFile(join(dir,path));assert.equal(blob(data),expected,'Committed source bytes changed: '+path);
    files++;bytes+=data.length;aggregate.update(path+'\0'+expected+'\n');
  }
  assert.ok(files>0,'No tracked source files');
  assert.equal(git(dir,'diff','--name-only','HEAD','--','dist','research-data','tools/hallmark','scripts/verify-hallmark-design.mjs','.github/workflows/hallmark-design.yml'),'','Tracked inputs must be read-only');
  return {commit,files,bytes,manifestSha256:aggregate.digest('hex'),gitBlobsMatched:true};
}
async function runChild(name,cli,timeout){
  const log=join(REPORTS,name),remaining=deadline-Date.now();
  if(remaining<=1000)throw new Error('Total audit runtime exhausted before '+name);
  console.log('HALLMARK_PHASE_START '+JSON.stringify({name,at:new Date().toISOString(),args:cli}));
  return await new Promise(resolveRun=>{
    const child=spawn(process.execPath,[join(PATCHED,'sloplint.mjs'),...cli],{
      cwd:WORK,env:{...process.env,HALLMARK_CI_CHROME_ARGS:'ephemeral-ci',HALLMARK_ATLAS_READY:'1'},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
    activeChild=child;let stdout='',stderr='',timedOut=false,outputExceeded=false;
    const stop=()=>{try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}};
    const timer=setTimeout(()=>{timedOut=true;stop();},Math.min(timeout,remaining-500));
    child.stdout.on('data',data=>{stdout+=data;if(stdout.length>64*1024*1024){outputExceeded=true;stop();}});
    child.stderr.on('data',data=>{stderr+=data;if(stderr.length>8*1024*1024){outputExceeded=true;stop();}});
    child.on('error',error=>{stderr+='\n'+errorText(error);});
    child.on('close',async(code,signal)=>{
      clearTimeout(timer);activeChild=null;
      try{
        await writeFile(log+'.stdout.json',stdout);await writeFile(log+'.stderr.txt',stderr);
        let report=null;try{report=JSON.parse(stdout);}catch(error){receipt.integrityErrors.push(name+': invalid findings JSON: '+error.message);}
        integrity(!timedOut,name+': timed out');integrity(!outputExceeded,name+': output limit exceeded');
        integrity(!signal,name+': terminated by '+signal);
        integrity(!/sloplint: internal error|sloplint: skipped|sloplint: cannot read|render tier: failed on/i.test(stderr),name+': internal/read/render error; see stderr');
        resolveRun({name,code,signal,timedOut,report,stderr,stdoutSha256:sha(stdout)});
      }catch(error){receipt.integrityErrors.push(errorText(error));resolveRun({name,code,signal,report:null,stderr});}
    });
  });
}
const slug=url=>url.replace(/^https?:\/\//,'').replace(/[^\w.-]+/g,'-').replace(/-+$/,'');
async function screenshotProof(phase){
  const folder=join(WORK,'.hallmark',phase==='baseline'?'before':'shots'),names=await readdir(folder).catch(()=>[]);
  const tags=['1280x800','375','1440x900','1440-full','1920x1080'];
  const required=ROUTES.flatMap(route=>tags.map(tag=>slug(route.url)+'-'+tag+'.png'));
  for(const name of required){
    if(!names.includes(name)){receipt.integrityErrors.push(phase+': missing screenshot '+name);continue;}
    integrity((await stat(join(folder,name))).size>0,phase+': empty screenshot '+name);
  }
  const reviewImages=[];
  for(const [routeName,tag] of ROUTES.flatMap(route=>['1440x900','375'].map(tag=>[route.name,tag]))){
    const route=ROUTES.find(r=>r.name===routeName),file=slug(route.url)+'-'+tag+'.png';
    if(!names.includes(file))continue;
    const bytes=await readFile(join(folder,file)),name=phase+'/'+routeName+'-'+tag+'.png',base64=bytes.toString('base64'),size=30000,total=Math.ceil(base64.length/size);
    reviewImages.push({name,bytes:bytes.length,sha256:sha(bytes)});
    for(let index=0;index<total;index++)console.log('HALLMARK_IMAGE_CHUNK '+JSON.stringify({name,index,total,data:base64.slice(index*size,(index+1)*size)}));
  }
  return {expected:required.length,found:required.filter(name=>names.includes(name)).length,
    viewportWidths:[320,375,414,768,1024,1280,1440,1920],screenshotTags:tags,folder:relative(OUT,folder),reviewImages};
}
async function phase(version,kind,mode,expectedFiles){
  activePhase=version+'-'+kind;
  const cli=[...(kind==='static'?['dist']:['dist/styles.css',...URLS.flatMap(url=>['--url',url])]),'--scope','app','--genre','modern-minimal','--json','--'+mode];
  if(mode==='kept')await cp(join(REPORTS,'baseline-'+kind+'-before.json'),join(WORK,'.hallmark/before.json'));
  const result=await runChild(activePhase,cli,kind==='static'?60000:270000),report=result.report,summary=report?.summary,findings=report?.findings;
  integrity(summary&&Array.isArray(findings),activePhase+': report schema missing');
  if(!summary||!Array.isArray(findings)){receipt.phases.push({name:activePhase,code:result.code,status:'invalid'});return;}
  integrity([0,1].includes(result.code),activePhase+': unexpected exit '+result.code);
  integrity(summary.files===expectedFiles,activePhase+': file coverage '+summary.files+' expected '+expectedFiles);
  integrity(summary.render===(kind==='render'?'ran':'off'),activePhase+': render='+summary.render);
  integrity(!findings.some(f=>String(f.gate)==='render'&&f.grade==='FAIL'),activePhase+': upstream render failure');
  integrity(!findings.some(f=>String(f.gate)==='kept'&&/not compared|no before record/i.test(f.evidence)),activePhase+': kept comparison incomplete');
  const detail={name:activePhase,code:result.code,summary,stdoutSha256:result.stdoutSha256,findingsPath:relative(OUT,join(REPORTS,activePhase+'.stdout.json'))};
  if(mode==='before'){
    integrity(typeof summary.before==='string',activePhase+': before record not reported');
    const path=join(WORK,'.hallmark/before.json'),before=JSON.parse(await readFile(path,'utf8'));await cp(path,join(REPORTS,'baseline-'+kind+'-before.json'));
    if(kind==='render'){
      const covered=Object.keys(before.pages||{});
      integrity(covered.length===URLS.length&&URLS.every(url=>before.pages[url]),'Baseline render inventory must contain all eight exact URLs');detail.renderedUrls=covered;
    }else integrity(Object.keys(before.files||{}).length===2,'Baseline static must inventory both HTML files');
  }else integrity(typeof summary.kept==='string'&&!summary.kept.includes('nothing recorded'),activePhase+': no substantive kept comparison');
  if(kind==='render'){
    const actualReady=result.stderr.split(/\r?\n/).filter(line=>line.startsWith('HALLMARK_RENDER_READY ')).map(line=>JSON.parse(line.slice('HALLMARK_RENDER_READY '.length)));
    detail.actualRenderReady=actualReady;
    integrity(actualReady.length===ROUTES.length&&ROUTES.every(route=>actualReady.some(item=>item.url===route.url&&item.route===route.name)),
      activePhase+': actual renderer readiness was not observed for all eight routes');
    detail.screenshots=await screenshotProof(version);
    detail.requestedUrls=URLS.filter(url=>(requestCounts.get(activePhase+'\n'+url)||0)>0);
    integrity(detail.requestedUrls.length===8,activePhase+': not all eight URLs reached the server');
  }
  receipt.phases.push(detail);
  const counts={};for(const f of findings){const key=f.grade+' '+f.gate;counts[key]=(counts[key]||0)+1;}
  console.log('HALLMARK_PHASE_RECEIPT '+JSON.stringify({name:activePhase,code:result.code,...summary,counts,screenshots:detail.screenshots?.found,requestedUrls:detail.requestedUrls?.length}));
  if(version==='current')for(const finding of findings)console.log('HALLMARK_FINDING '+JSON.stringify({phase:activePhase,...finding}));
}
async function copyDist(from){await rm(DIST,{recursive:true,force:true});await cp(join(from,'dist'),DIST,{recursive:true,dereference:false});}
async function readiness(version){
  activePhase=version+'-readiness';
  const req=createRequire(join(process.env.HALLMARK_PUPPETEER,'noop.js')),puppeteer=(await import(pathToFileURL(req.resolve('puppeteer-core')).href)).default;
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,timeout:remainingBudget(),protocolTimeout:remainingBudget(),args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run']});
  try{
    for(const route of ROUTES){
      remainingBudget();
      const page=await browser.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(errorText(error)));
      try{
        await page.setViewport({width:1440,height:900});
        await page.goto(route.url,{waitUntil:'domcontentloaded',timeout:remainingBudget()});
        await page.waitForFunction(name=>{
          const doc=name==='mobile-preview'?document.querySelector('#mobile-preview')?.contentDocument:document;
          if(!doc||doc.documentElement.dataset.boot!=='ready')return false;
          if((name==='btc'||name==='mobile-preview')&&(doc.querySelector('.atlas-plot[aria-busy="true"]')||doc.querySelector('.workspace-toast:not([hidden])')))return false;
          if(name==='data')return doc.querySelectorAll('#data-body tr[data-asset-symbol]').length===18;
          if(name==='evidence')return doc.querySelectorAll('#evidence-body [data-evidence-detail]').length>0;
          if(name==='compare')return doc.querySelectorAll('#structure-chart path').length>0&&doc.querySelectorAll('#structure-cycles tr').length>0;
          if(name==='eth')return Number(doc.querySelector('#eth-chart')?.dataset.observedCandleCount)>0;
          if(name==='bmnr'||name==='mstr')return Number(doc.querySelector('#equity-chart')?.dataset.observedCandleCount)>0;
          return doc.querySelectorAll('#lab-chart path').length>0;
        },{timeout:remainingBudget()},route.name);
        assert.equal(errors.length,0,'Runtime errors in '+version+' '+route.name+': '+errors.join('; '));
        receipt.readiness.push({version,route:route.name,url:route.url,status:'ready'});
      }finally{await page.close();}
    }
  }finally{await browser.close();}
  console.log('HALLMARK_READINESS '+JSON.stringify({version,routes:receipt.readiness.filter(r=>r.version===version)}));
}
try{
  await mkdir(REPORTS,{recursive:true});await mkdir(WORK,{recursive:true});await mkdir(PATCHED,{recursive:true});await rm(join(WORK,'.hallmark'),{recursive:true,force:true});
  const manifest=JSON.parse(await readFile(join(ROOT,'tools/hallmark/provenance.json'),'utf8'));receipt.toolProvenance=manifest;
  for(const source of manifest.sources){
    const data=await readFile(join(UPSTREAM,source.name));assert.equal(blob(data),source.gitBlob,'Pinned upstream source hash mismatch: '+source.name);
    let output=data;
    if(source.name==='sloplint-render.mjs'){
      const launch=manifest.compatibilityPatch,ready=manifest.readinessPatch;
      let text=data.toString('utf8');
      assert.deepEqual(manifest.buildCopyPatchOrder,['compatibilityPatch','readinessPatch'],'Unexpected renderer patch order');
      assert.equal(text.split(launch.before).length-1,1,'Chrome launch patch anchor must occur exactly once');
      text=text.replace(launch.before,launch.after);
      const launchBlob=blob(Buffer.from(text));
      assert.equal(launchBlob,launch.launchOnlyGitBlob,'Launch-only renderer hash mismatch');
      assert.equal(launchBlob,ready.sourceGitBlob,'Readiness patch source hash mismatch');
      assert.equal(text.split(ready.before).length-1,1,'Readiness patch anchor must occur exactly once');
      text=text.replace(ready.before,ready.after);output=Buffer.from(text);
      assert.equal(blob(output),ready.patchedGitBlob,'Readiness-patched renderer hash mismatch');
      assert.equal(blob(output),launch.patchedGitBlob,'Final renderer hash mismatch');
    }
    await writeFile(join(PATCHED,source.name),output);
  }
  const beforeCurrent=await sourceProof(ROOT),beforeBaseline=await sourceProof(BASELINE);assert.equal(beforeBaseline.commit,PIN,'Baseline checkout must match the fixed source commit');
  receipt.sourceCommit=beforeCurrent.commit;receipt.sourceBefore={current:beforeCurrent,baseline:beforeBaseline};
  const baselineFiles=await inventory(join(BASELINE,'dist')),currentFiles=await inventory(join(ROOT,'dist'));
  const count=files=>({css:files.filter(p=>p.endsWith('.css')).length,html:files.filter(p=>p.endsWith('.html')).length});
  receipt.sourceInventory={baseline:count(baselineFiles),current:count(currentFiles)};
  assert.deepEqual(count(baselineFiles),{css:24,html:2},'Pinned baseline inventory changed');
  assert.ok(count(currentFiles).css>=24&&count(currentFiles).html===2,'Current source must keep the complete baseline screen/style scope');
  const installed=JSON.parse(await readFile(join(process.env.HALLMARK_PUPPETEER||'','node_modules/puppeteer-core/package.json'),'utf8'));
  assert.equal(installed.version,'25.16.0','Unexpected browser tooling version');assert.ok(process.env.CHROME_PATH,'CHROME_PATH required');
  receipt.browser={puppeteerCore:installed.version,chrome:execFileSync(process.env.CHROME_PATH,['--version'],{encoding:'utf8',timeout:15000}).trim(),node:process.version};
  const font=await readFile(process.env.HALLMARK_FONT_FILE||'');assert.equal(blob(font),'dc4a7c65e6f450bf17c10a2405250b620eb78703','Pinned Korean font missing or changed');
  receipt.font={commit:'f8d157532fbfaeda587e826d4cd5b21a49186f7c',gitBlob:blob(font),family:'Noto Sans CJK KR'};
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,ORIGIN),key=activePhase+'\n'+url.href;requestCounts.set(key,(requestCounts.get(key)||0)+1);
      if(!url.pathname.startsWith(BASE)){res.writeHead(404);res.end();return;}
      const path=decodeURIComponent(url.pathname.slice(BASE.length))||'index.html',file=resolve(DIST,path);
      if(!file.startsWith(DIST+sep)){res.writeHead(403);res.end();return;}
      const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(4177,'127.0.0.1',accept);});
  await copyDist(BASELINE);await readiness('baseline');
  await phase('baseline','static','before',26);await phase('baseline','render','before',1);
  await copyDist(ROOT);await readiness('current');
  await phase('current','static','kept',count(currentFiles).css+count(currentFiles).html);await phase('current','render','kept',1);
  const afterCurrent=await sourceProof(ROOT),afterBaseline=await sourceProof(BASELINE);
  assert.deepEqual(afterCurrent,beforeCurrent,'Current source changed during audit');assert.deepEqual(afterBaseline,beforeBaseline,'Baseline source changed during audit');
  receipt.sourceReadOnly={current:true,baseline:true,gitBlobsMatched:true};
}catch(error){receipt.integrityErrors.push(errorText(error));}
finally{
  if(activeChild){try{process.kill(-activeChild.pid,'SIGKILL');}catch{}}
  if(server){server.closeAllConnections?.();await new Promise(accept=>server.close(accept));}
  const current=receipt.phases.filter(p=>p.name.startsWith('current-')&&p.summary);
  receipt.designGate.fails=current.reduce((n,p)=>n+p.summary.fails,0);receipt.designGate.reflex=current.reduce((n,p)=>n+p.summary.reflex,0);
  receipt.designGate.status=current.length!==2?'incomplete':receipt.designGate.fails||receipt.designGate.reflex?'fail':'pass';
  receipt.integrityGate={status:receipt.integrityErrors.length?'fail':'pass',errors:receipt.integrityErrors.length};
  receipt.finishedAt=new Date().toISOString();receipt.durationMilliseconds=Date.now()-started;
  receipt.exitCode=receipt.integrityErrors.length?2:receipt.designGate.status==='pass'?0:1;
  await json(join(OUT,'receipt.json'),receipt);
  console.log('HALLMARK_AUDIT_RECEIPT '+JSON.stringify({sourceCommit:receipt.sourceCommit,baselineCommit:PIN,
    phases:receipt.phases.map(p=>({name:p.name,...p.summary})),designGate:receipt.designGate,integrityGate:receipt.integrityGate,
    sourceReadOnly:receipt.sourceReadOnly,durationMilliseconds:receipt.durationMilliseconds,readiness:receipt.readiness,
    errors:receipt.integrityErrors.slice(0,8),exitCode:receipt.exitCode}));
  process.exitCode=receipt.exitCode;
}
