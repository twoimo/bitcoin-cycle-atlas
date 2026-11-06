import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {stripTypeScriptTypes} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){assert(process.argv[i]?.startsWith('--')&&process.argv[i+1],'Expected --name value');args.set(process.argv[i].slice(2),process.argv[i+1]);}
const baseline=args.get('baseline')||'624888270fcb539ab08d505e5affab5f5d435776';
const out=resolve(root,args.get('out')||'build/loading-design');
const browserPath=args.get('browser')||process.env.CHROME_PATH;
const playwrightPath=args.get('playwright')||process.env.PLAYWRIGHT_MODULE;
assert(browserPath&&playwrightPath,'Supply --browser and --playwright');
await mkdir(out,{recursive:true});
const temporary=await mkdtemp(join(tmpdir(),'atlas-loading-before-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitFile=path=>execFileSync('git',['show',`${baseline}:${path}`],{cwd:root});
const sourcePaths=['dist/loading-surfaces.js','dist/loading-surfaces.css','dist/rsi-chart-layout.js','dist/vendor/skullet/styles.css','dist/vendor/skullet/skullet.js','dist/vendor/skullet/LICENSE','apps/web/src/rsi-chart-model.ts','tools/skullet/atlas-styles.css','tools/skullet/provenance.json','tools/skullet/upstream/styles.css','tools/skullet/upstream/LICENSE','scripts/sync-skullet.mjs','scripts/verify-loading-surfaces-browser.mjs'];
const report={status:'ISSUES',baseline,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),method:'Pinned original renderer oracle plus native browser loading integration fixture; not a complete app-route or assistive-technology certification',sourceHashes:{},baselineSourceHashes:{},rendererOracle:[],geometry:[],kinds:[],lifecycle:[],screenshots:[],failures:[]};
for(const path of sourcePaths)report.sourceHashes[path]=sha(await readFile(resolve(root,path)));
const snapshotPaths=['loading-surfaces.js','loading-surfaces.css','vendor/skullet/styles.css','vendor/skullet/skullet.js'];
for(const path of snapshotPaths){const bytes=gitFile('dist/'+path);report.baselineSourceHashes['dist/'+path]=sha(bytes);await mkdir(dirname(join(temporary,path)),{recursive:true});await writeFile(join(temporary,path),bytes);}
const {skeletonMarkup}=await import(pathToFileURL(resolve(root,'dist/loading-surfaces.js')));
const {skeletonMarkup:beforeMarkup}=await import(pathToFileURL(join(temporary,'loading-surfaces.js')));

async function renderer(source){
  // Execute the real original model, with type syntax removed and only module
  // URLs resolved. Expected coordinates are not copied from the new helper.
  const code=stripTypeScriptTypes(source).replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,quote,specifier)=>`from ${JSON.stringify(pathToFileURL(resolve(root,'apps/web/src',specifier)).href)}`);
  return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const beforeModelBytes=gitFile('apps/web/src/rsi-chart-model.ts');
report.baselineSourceHashes['apps/web/src/rsi-chart-model.ts']=sha(beforeModelBytes);
const original=await renderer(beforeModelBytes.toString());
const current=await renderer(await readFile(resolve(root,'apps/web/src/rsi-chart-model.ts'),'utf8'));
const prices=[['2024-01-01',40],['2024-01-02',48],['2024-01-03',44]];
function geometryFrom(model,width,height,showRsi=true){return model.chartGeometry(prices,[],[],{...model.initialChartView(prices),showRsi},width,height);}
function coordinates(g){return Object.fromEntries(['left','right','top','bottom','priceBottom','rsiTop'].map(k=>[k,g[k]]));}
for(const width of [260,320,390,599,600,601,620,621,900,1440])for(const height of [280,281,399,448,452,900])for(const showRsi of [true,false]){
  const old=geometryFrom(original,width,height,showRsi),now=geometryFrom(current,width,height,showRsi);
  assert.deepEqual(coordinates(now),coordinates(old),'Existing actual chart coordinates changed');
  assert.deepEqual(now.ticks,old.ticks);for(const [day,value]of prices){assert.equal(now.x(day),old.x(day));assert.equal(now.y(value),old.y(value));assert.equal(now.fromY(now.y(value)),old.fromY(old.y(value)));}
  report.rendererOracle.push({width,height,showRsi,coordinates:coordinates(old)});
}

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),segments=url.pathname.split('/').filter(Boolean),version=segments.shift();
    if(!['before','current'].includes(version))throw Error('Unknown source');
    const name=segments.join('/'),base=version==='before'?temporary:resolve(root,'dist');
    if(name==='fixture'){
      const kind=url.searchParams.get('kind')||'rsi',markup=version==='before'?beforeMarkup:skeletonMarkup;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="/${version}/vendor/skullet/styles.css"><link rel="stylesheet" href="/${version}/loading-surfaces.css"><style>:root{--surface-hover:#202a39;--bg:#0b0e14;--border-soft:#20252e}body{margin:0;background:var(--bg);color:#e3e9f1;font:14px sans-serif}#host{width:100%;height:520px}button{height:44px}button:focus-visible{outline:2px solid #9fc5ff}</style></head><body><button id="before">이전 작업</button><section id="host">${markup(kind,'가격 자료 로딩')}</section><button id="after">다음 작업</button></body></html>`);return;
    }
    const path=resolve(base,name);if(!path.startsWith(base+'/'))throw Error('Outside fixture source');
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));
  }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(pathToFileURL(playwrightPath));
let browser;
function check(condition,message,details){if(!condition){report.failures.push({message,details});throw new Error(message);}}
async function settle(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));}
async function load(page,version,kind='rsi'){
  await page.goto(`${origin}/${version}/fixture?kind=${kind}`,{waitUntil:'load'});
  await page.evaluate(async version=>{window.loading=await import(`/${version}/loading-surfaces.js`);},version);
}
async function enhance(page){await page.evaluate(()=>{window.dispose=window.loading.enhanceSkeleton(document.querySelector('.atlas-skeleton'));});await settle(page);}
async function state(page){return page.evaluate(()=>{
  const root=document.querySelector('.atlas-skeleton'),paint=root?.querySelector('.atlas-skeleton-paint');
  const box=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,display:s.display,visibility:s.visibility,background:s.backgroundColor,animations:e.getAnimations().filter(a=>a.playState==='running').length};};
  const blocks=[...root.querySelectorAll('[skullet-block]')],bones=[...root.querySelectorAll('[skullet-layer]')].flatMap(e=>[...(e.shadowRoot?.children||[])]);
  return{kind:root.dataset.atlasSkeleton,status:root.getAttribute('role'),busy:root.getAttribute('aria-busy'),label:root.querySelector('.atlas-loading-label').textContent,inert:paint.inert,hiddenFromAT:paint.getAttribute('aria-hidden'),interactive:paint.querySelectorAll('a,button,input,select,textarea,[tabindex]').length,enhanced:paint.dataset.enhanced,blocks:blocks.map(box),calendarCells:[...root.querySelectorAll('.atlas-skeleton-calendar > [skullet-block]')].map(box),bones:bones.map(box),automaticCSS:document.querySelectorAll('style[data-skullet]').length};
});}
async function plotGeometry(page){return page.evaluate(()=>{
  const panels=document.querySelector('.atlas-skeleton-rsi-panels'),p=panels.getBoundingClientRect(),a=panels.firstElementChild.getBoundingClientRect(),b=panels.lastElementChild.getBoundingClientRect();
  const bones=[...document.querySelector('[skullet-layer]')?.shadowRoot?.children||[]].map(e=>e.getBoundingClientRect());
  const painted=r=>bones.some(b=>['left','right','top','bottom'].every(k=>Math.abs(b[k]-r[k])<.1));
  return{width:panels.clientWidth,height:panels.clientHeight,left:a.left-p.left,right:a.right-p.left,top:a.top-p.top,bottom:b.bottom-p.top,priceBottom:a.bottom-p.top,rsiTop:b.top-p.top,pricePainted:painted(a),rsiPainted:painted(b)};
});}

try{
  browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:900,height:700},reducedMotion:'no-preference'}),page=await context.newPage();
  page.on('pageerror',error=>report.failures.push({message:'Browser runtime error',details:error.message}));
  for(const version of ['before','current']){
    await load(page,version);await enhance(page);
    for(const viewport of [390,599,600,612,620,621,900]){
      await page.setViewportSize({width:viewport,height:700});await settle(page);const actual=await plotGeometry(page),expected=coordinates(geometryFrom(original,actual.width,actual.height));
      const error=Math.max(...Object.keys(expected).map(k=>Math.abs(actual[k]-expected[k])));
      report.geometry.push({version,viewport,actual,expected,maxPixelError:error});
      if(version==='current'){check(error<.1,'Skeleton does not match the original actual renderer',{actual,expected});check(actual.pricePainted&&actual.rsiPainted,'Measured RSI blocks were not painted by Skullet',actual);}
    }
  }
  check(report.geometry.some(g=>g.version==='before'&&g.maxPixelError>25),'Original geometry failure was not reproduced');
  // An embedded center can be narrower than its containing browser viewport.
  // The actual allocated panel, rather than a viewport media query, owns axes.
  for(const [width,height]of [[390,352],[900,348],[390,800],[900,800]]){
    await page.setViewportSize({width:1000,height:900});await page.evaluate(({width,height})=>{Object.assign(document.querySelector('#host').style,{width:width+'px',height:height+'px'});},{width,height});await settle(page);
    const actual=await plotGeometry(page),expected=coordinates(geometryFrom(original,actual.width,actual.height));
    const error=Math.max(...Object.keys(expected).map(k=>Math.abs(actual[k]-expected[k])));report.geometry.push({version:'current',viewport:1000,allocated:{width,height},actual,expected,maxPixelError:error});
    check(error<.1&&actual.pricePainted&&actual.rsiPainted,'Embedded or resized panel lost chart alignment',{actual,expected});
  }
  await page.setViewportSize({width:900,height:700});
  for(const kind of ['chart','rsi','diagnosis','scenario','cashflow','table','list','detail','calendar']){
    await load(page,'current',kind);const initial=await state(page);
    check(initial.blocks.some(b=>b.width>0&&b.height>0&&b.visibility==='visible'),'Initial neutral blocks are invisible',initial);
    await enhance(page);const enhanced=await state(page);report.kinds.push({kind,initial,enhanced});
    check(enhanced.inert&&enhanced.hiddenFromAT==='true'&&enhanced.interactive===0,'Skeleton accessibility boundary failed',enhanced);
    check(enhanced.status==='status'&&enhanced.busy==='true'&&enhanced.label==='가격 자료 로딩','Loading announcement missing',enhanced);
    check(enhanced.bones.length>0&&enhanced.bones.every(b=>b.width>0&&b.height>0&&b.visibility==='visible'&&b.background==='rgb(32, 42, 57)'),'Skullet measured paint missing or wrong',enhanced);
    check(enhanced.bones.some(b=>b.animations>0),'Normal-motion skeleton has no animation',enhanced);
    check(enhanced.automaticCSS===0,'The generic upstream stylesheet was injected',enhanced);
    await page.focus('#before');await page.keyboard.press('Tab');check(await page.evaluate(()=>document.activeElement.id)==='after','Keyboard focus entered the inert skeleton');
  }
  await load(page,'current');await enhance(page);const cdp=await context.newCDPSession(page),ax=await cdp.send('Accessibility.getFullAXTree');
  const statuses=ax.nodes.filter(n=>!n.ignored&&n.role?.value==='status');
  check(statuses.length===1,'Native accessibility tree needs one status announcement',statuses);
  check(ax.nodes.some(n=>!n.ignored&&n.name?.value==='가격 자료 로딩'),'Native accessibility tree lost the loading label');
  report.accessibility={statusCount:statuses.length,loadingLabelExposed:true,paintInert:true,keyboardSkippedPaint:true};
  for(const width of [390,900]){await page.setViewportSize({width,height:700});await settle(page);const file=`loading-rsi-${width}.png`,bytes=await page.screenshot({path:join(out,file)});report.screenshots.push({file,sha256:sha(bytes),bytes:bytes.length});}

  for(const action of ['clear','hide','detach','close-dialog','pagehide']){
    await load(page,'current');
    await page.evaluate(()=>{
      window.observers=new Map();const Native=window.ResizeObserver;window.ResizeObserver=class extends Native{constructor(callback){super(callback);window.observers.set(this,new Set());}observe(node,options){window.observers.get(this).add(node);return super.observe(node,options);}unobserve(node){window.observers.get(this).delete(node);return super.unobserve(node);}disconnect(){window.observers.get(this).clear();return super.disconnect();}};
      const host=document.querySelector('#host');host.innerHTML='<button id="retry">다시 조회</button><p id="result">보존한 결과</p>';window.savedButton=host.firstElementChild;window.clicks=0;window.savedButton.onclick=()=>window.clicks++;
      window.loading.setLoadingSurface(host,true,{kind:'rsi',label:'가격 자료 로딩'});
      window.savedBones=[...host.querySelector('[skullet-layer]').shadowRoot.children];
    });await settle(page);
    await page.evaluate(action=>{
      const host=document.querySelector('#host');
      if(action==='clear')window.loading.clearLoadingSurface(host);
      if(action==='hide')host.hidden=true;
      if(action==='detach')host.remove();
      if(action==='close-dialog'){const dialog=document.createElement('dialog');document.body.append(dialog);dialog.append(host);dialog.showModal();dialog.close();}
      if(action==='pagehide')window.dispatchEvent(new PageTransitionEvent('pagehide'));
    },action);await settle(page);
    const disposed=await page.evaluate(()=>({remaining:document.querySelectorAll('.atlas-skeleton').length,observed:[...window.observers.values()].reduce((n,s)=>n+s.size,0),connectedBones:window.savedBones.filter(b=>b.isConnected).length,runningAnimations:window.savedBones.flatMap(b=>b.getAnimations()).filter(a=>a.playState==='running').length}));
    report.lifecycle.push({action,...disposed});check(Object.values(disposed).every(v=>v===0),'Loading disposal left active paint or observers',{action,...disposed});
    if(action==='clear'){
      await page.evaluate(()=>{const host=document.querySelector('#host');document.querySelector('#result').textContent='조회 실패';window.savedButton.click();window.loading.setLoadingSurface(host,true,{kind:'table'});window.loading.clearLoadingSurface(host);});
      check(await page.evaluate(()=>window.savedButton===document.querySelector('#retry')&&window.clicks===1&&document.querySelector('#result').textContent==='조회 실패'),'Error/retry lost its real node or became a fake success');
    }
  }
  const reduced=await browser.newContext({viewport:{width:390,height:700},reducedMotion:'reduce'}),reducedPage=await reduced.newPage();
  await load(reducedPage,'current');await enhance(reducedPage);const reducedState=await state(reducedPage);
  check(reducedState.bones.length>0&&reducedState.bones.every(b=>b.animations===0),'Reduced motion still animates',reducedState);report.reducedMotion={visibleBones:reducedState.bones.length,runningAnimations:0};await reduced.close();
  const noScript=await browser.newContext({viewport:{width:390,height:700},javaScriptEnabled:false}),noScriptPage=await noScript.newPage();
  await noScriptPage.goto(`${origin}/current/fixture?kind=calendar`);const noScriptState=await state(noScriptPage);
  check(noScriptState.calendarCells.length===42&&noScriptState.calendarCells.every(b=>b.visibility==='visible'&&b.width>0&&b.height>0),'Disabled scripting hides a static calendar cell',noScriptState);report.disabledScripting={visibleCalendarCells:noScriptState.calendarCells.length,status:noScriptState.status};await noScript.close();
  check(report.failures.length===0,'Runtime errors were observed',report.failures);
  report.status='PASS';await context.close();
}catch(error){report.failures.push({message:error.message,stack:error.stack});process.exitCode=1;}
finally{
  await browser?.close();await new Promise(r=>server.close(r));await rm(temporary,{recursive:true,force:true});
  for(const path of sourcePaths)assert.equal(sha(await readFile(resolve(root,path))),report.sourceHashes[path],'Source changed during verification: '+path);
  report.finishedAt=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,report:join(out,'report.json'),rendererOracle:report.rendererOracle.length,geometry:report.geometry.length,kinds:report.kinds.length,lifecycle:report.lifecycle.length,failures:report.failures}));
}
