// R12 controlled failure-state A/B diagnostic. This creates no deployment and
// changes no product files or stored application data. Run only after the main
// sequential browser/test gates have finished.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, mkdir, rm, stat, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const argv=process.argv.slice(2), option=(key,fallback)=>argv.includes(key)?argv[argv.indexOf(key)+1]:fallback;
const out=resolve(option('--out','/workspace/scratch/15a50edfd7d0/r12-diagnostic/controlled-notice-ab'));
const bin=process.env.ATLAS_BROWSER_PATH||'/workspace/scratch/55a6bfaf803b/conference-tools/chrome-with-proxy';
const variants=[
  {id:'baseline',root:option('--baseline','/workspace/scratch/55a6bfaf803b/bitcoin-cycle-atlas'),expectedHead:'ce8df9262b13a657823752408481f742f7a31701'},
  {id:'candidate',root:option('--candidate','/workspace/scratch/15a50edfd7d0/bitcoin-cycle-atlas'),expectedHead:'4cc98d8195707ab69e534236bf2ed7fa22819327'},
];
const sourcePaths=['dist/ui/page-description.js','dist/atlas-shell.css','dist/btc-refresh-status.js','dist/index.html','dist/viewport.css','dist/styles.css','dist/editorial-system.css'];
const fixtureClock='2026-11-12T00:00:00.000Z', fixtureObservation='2026-11-10';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=.01;
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
async function identity(variant){
  const head=git(variant.root,['rev-parse','HEAD']),tree=git(variant.root,['rev-parse','HEAD^{tree}']);
  const changed=git(variant.root,['diff','--name-only',variant.expectedHead,'--','dist']);
  const dirty=git(variant.root,['status','--porcelain','--untracked-files=all','--','dist']);
  if(changed||dirty)throw new Error(`${variant.id}: product source differs from the pinned commit: ${changed||dirty}`);
  const files=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(resolve(variant.root,path)))])));
  return {head,tree,expectedHead:variant.expectedHead,expectedTree:git(variant.root,['rev-parse',variant.expectedHead+'^{tree}']),files,productDiff:changed,productStatus:dirty};
}
class Cdp{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.events=[];ws.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(!message.id){this.events.push(message);return;}const call=this.pending.get(message.id);if(!call)return;clearTimeout(call.timer);this.pending.delete(message.id);message.error?call.reject(new Error(message.error.message)):call.resolve(message.result||{});});}
  static async connect(url){const ws=new WebSocket(url);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});return new Cdp(ws);}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout '+method));},30000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
}
async function evaluate(cdp,fn,...args){const response=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(value=>JSON.stringify(value)).join(',')})`,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error('Browser evaluation: '+JSON.stringify(response.exceptionDetails));return response.result.value;}
async function until(fn,label){const deadline=Date.now()+45000;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message))throw error;}await delay(100);}throw new Error('Timed out: '+label);}
function inspect(){
  const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const within=(a,b)=>!!a&&!!b&&a.left>=b.left-.01&&a.top>=b.top-.01&&a.right<=b.right+.01&&a.bottom<=b.bottom+.01;
  const painted=node=>!!node&&!node.closest('[hidden],[inert],[aria-hidden="true"]')&&node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&rect(node).width>1&&rect(node).height>1;
  const heading=document.getElementById('atlas-page-heading'),copy=heading?.parentElement,toolbar=document.querySelector('.atlas-canvas-heading'),anchor=toolbar?.querySelector('.lab-toolbar');
  const notice=document.getElementById('btc-refresh-notice'),main=document.getElementById('main'),stage=document.querySelector('.atlas-chart-stage'),plot=document.querySelector('.atlas-plot'),footer=document.querySelector('.footer');
  const headingRect=rect(heading),toolbarRect=rect(toolbar),anchorRect=rect(anchor),range=document.createRange();if(heading)range.selectNodeContents(heading);
  const glyphs=heading?[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height})):[];
  const viewport={left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight};
  const expected=anchorRect?{left:anchorRect.left-76,top:anchorRect.top+(anchorRect.height-14)/2}:null;
  const style=heading&&getComputedStyle(heading),mainStyle=main&&getComputedStyle(main);
  return {
    page:document.body.dataset.page,boot:document.documentElement.dataset.boot,viewport,
    title:heading?.textContent.trim(),h1Count:document.querySelectorAll('h1').length,paintedH1Count:[...document.querySelectorAll('h1')].filter(painted).length,
    followsToolbar:!!toolbar&&toolbar.nextElementSibling===copy,outsidePlot:!!copy&&!copy.closest('.atlas-plot'),
    heading:headingRect,glyphs,toolbar:toolbarRect,anchor:anchorRect,stage:rect(stage),workspace:rect(document.querySelector('.workspace')),main:rect(main),plot:rect(plot),bottom:rect(document.querySelector('.workbench-bottom-bar')),
    footer:{rect:rect(footer),painted:painted(footer),insideMain:!!footer&&footer.parentElement===main},
    headingInViewport:within(headingRect,viewport),glyphsInViewport:glyphs.length>0&&glyphs.every(box=>within(box,viewport)),toolbarInViewport:within(toolbarRect,viewport),stageInViewport:within(rect(stage),viewport),
    headingInToolbar:within(headingRect,toolbarRect),glyphsInToolbar:glyphs.length>0&&glyphs.every(box=>within(box,toolbarRect)),
    expected,placementDelta:expected&&headingRect?{left:headingRect.left-expected.left,top:headingRect.top-expected.top}:null,
    notice:{visible:painted(notice),hidden:notice?.hidden,state:notice?.dataset.state,ariaBusy:notice?.getAttribute('aria-busy'),text:notice?.textContent.trim(),rect:rect(notice),mainHasNotice:main?.dataset.btcNotice==='true'},
    mainLayout:{display:mainStyle?.display,rows:mainStyle?.gridTemplateRows,height:mainStyle?.height,minHeight:mainStyle?.minHeight},
    noticeVariables:{mobile:document.documentElement.style.getPropertyValue('--btc-refresh-height'),compare:document.documentElement.style.getPropertyValue('--btc-compare-notice-height')},
    font:{family:style?.fontFamily,size:style?.fontSize,lineHeight:style?.lineHeight,status:document.fonts.status,optionalMedia:document.getElementById('atlas-optional-fonts')?.media,optionalSheet:!!document.getElementById('atlas-optional-fonts')?.sheet},
    horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),verticalExtent:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight),bodyScrollHeight:document.body.scrollHeight,documentScrollHeight:document.documentElement.scrollHeight,
  };
}
async function settled(cdp,label){let previous='',steady=0,state;await until(async()=>{state=await evaluate(cdp,inspect);const key=JSON.stringify(state);steady=key===previous?steady+1:0;previous=key;return steady>=3;},label);return state;}
async function fonts(cdp){const doc=await cdp.send('DOM.getDocument',{depth:1});const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#atlas-page-heading'});return (await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
function commonFailures(state){const failures=[];if(state.h1Count!==1||state.paintedH1Count!==1)failures.push('expected exactly one DOM and painted h1');if(state.title!=='사이클 비교')failures.push('wrong title');if(!state.followsToolbar||!state.outsidePlot)failures.push('heading sibling ownership changed');if(state.horizontalOverflow!==0)failures.push('horizontal overflow');return failures;}
function visibleFailures(state){const failures=commonFailures(state);if(!state.headingInViewport||!state.glyphsInViewport||!state.toolbarInViewport||!state.stageInViewport||!state.headingInToolbar||!state.glyphsInToolbar)failures.push('heading, glyphs or shell outside viewport/toolbar');if(!near(state.placementDelta?.left,0)||!near(state.placementDelta?.top,0))failures.push('stale heading coordinates');return failures;}
async function screenshot(cdp,file){const response=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const bytes=Buffer.from(response.data,'base64');await writeFile(resolve(out,file),bytes);return {file,bytes:bytes.length,sha256:sha(bytes)};}
async function serve(variant){const site=resolve(variant.root,'dist'),prefix='/bitcoin-cycle-atlas';const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};const server=createServer(async(request,response)=>{try{const path=decodeURIComponent(new URL(request.url,'http://localhost').pathname);if(!path.startsWith(prefix+'/'))throw new Error('route');let file=resolve(site,'.'+path.slice(prefix.length));if(!file.startsWith(site+'/'))throw new Error('scope');if((await stat(file)).isDirectory())file=resolve(file,'index.html');file=await realpath(file);if(!file.startsWith(site+'/'))throw new Error('scope');response.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});response.end(await readFile(file));}catch{response.writeHead(404);response.end('not found');}});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return {server,base:`http://127.0.0.1:${server.address().port}${prefix}/index.html`};}

await mkdir(out,{recursive:true});
const report={schemaVersion:1,kind:'r12-controlled-refresh-failure-ab',startedAt:new Date().toISOString(),scope:'Controlled failure state through the actual mountBtcRefreshStatus component; not evidence of a real provider outage. Independent owned browser/server; no deployment or product/stored-data changes.',fixture:{phase:'failed',page:'compare',asOf:fixtureObservation,now:fixtureClock},runtime:{node:process.version,platform:process.platform,arch:process.arch,browserPath:bin,helperSha256:sha(await readFile(fileURLToPath(import.meta.url)))},variants:[],cases:[],comparisons:[],failures:[]};
let chrome,profile,browser,cdp,currentServer;
try{
  for(const variant of variants)report.variants.push({...variant,before:await identity(variant)});
  profile=await mkdtemp(resolve(tmpdir(),'r12-controlled-notice-'));
  chrome=spawn(bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars','--window-size=2048,1600','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let stderr='',launchError;chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-5000);});chrome.once('error',error=>{launchError=error;});
  const port=await until(async()=>{if(launchError)throw launchError;try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{if(chrome.exitCode!==null)throw new Error('Chrome exited: '+stderr);return null;}},'Chrome launch');
  browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.runtime.version=await browser.send('Browser.getVersion');
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});const targets=await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();cdp=await Cdp.connect(targets.find(item=>item.id===targetId).webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  for(const variant of variants){
    const served=await serve(variant);currentServer=served.server;
    for(const width of [320,390,1440]){
      const entry={id:`${variant.id}-${width}`,variant:variant.id,width,height:900,status:'failed',failures:[]};report.cases.push(entry);cdp.events.length=0;
      let fixtureMounted=false;
      try{
        await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=620});
        await cdp.send('Page.navigate',{url:served.base+'?page=compare&legacy=1&compare-unit=rebased'});
        await until(()=>evaluate(cdp,()=>document.documentElement?.dataset.boot==='ready'&&document.body?.dataset.page==='compare'&&document.querySelectorAll('#structure-periods tr').length>0),'compare data');
        await until(()=>evaluate(cdp,()=>document.readyState==='complete'&&document.getElementById('btc-refresh-notice')?.getAttribute('aria-busy')==='false'),'initial real provider check and document finished');
        await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
        entry.realAppBeforeFixture=await settled(cdp,entry.id+' real app');
        await evaluate(cdp,async(clock,asOf)=>{
          const {mountBtcRefreshStatus}=await import(new URL('./btc-refresh-status.js?v=1.29.0',location.href).href);
          const controller=mountBtcRefreshStatus({document,onRetry:()=>{},now:()=>new Date(clock)});
          window.__r12ControlledNoticeFixture={controller};controller.update({phase:'idle',page:'compare',asOf});
        },fixtureClock,fixtureObservation);fixtureMounted=true;
        entry.before=await settled(cdp,entry.id+' controlled idle');entry.fontsBefore=await fonts(cdp);
        await evaluate(cdp,asOf=>window.__r12ControlledNoticeFixture.controller.update({phase:'failed',asOf,page:'compare'}),fixtureObservation);
        entry.failed=await settled(cdp,entry.id+' controlled failure');entry.fontsFailed=await fonts(cdp);
        entry.screenshot=await screenshot(cdp,entry.id+'-failed.png');
        entry.failures.push(...commonFailures(entry.failed));
        if(!entry.failed.notice.visible||entry.failed.notice.state!=='failed'||!entry.failed.notice.mainHasNotice||entry.failed.notice.ariaBusy!=='false')entry.failures.push('controlled failure notice was not visible and settled');
        const expectedNoticeHeight=width<=620?53:45;
        if(!near(entry.failed.notice.rect?.height,expectedNoticeHeight))entry.failures.push(`unexpected notice height; expected ${expectedNoticeHeight}`);
        if(variant.id==='baseline'){
          entry.negativeControl={stageOverflow:entry.failed.stage.bottom-900,toolbarOverflow:entry.failed.toolbar.bottom-900,expectedStageOverflow:expectedNoticeHeight};
          if(!near(entry.negativeControl.stageOverflow,expectedNoticeHeight))entry.failures.push('baseline did not reproduce the full extra notice row');
          if(width<=620&&!near(entry.negativeControl.toolbarOverflow,expectedNoticeHeight))entry.failures.push('baseline phone toolbar did not overflow by the notice height');
        }else{
          entry.failures.push(...visibleFailures(entry.failed));
          if(!near(entry.failed.stage.bottom,900)||width<=620&&!near(entry.failed.toolbar.bottom,900))entry.failures.push('candidate shell did not end at the viewport bottom');
          if(entry.failed.mainLayout.display!=='block')entry.failures.push('candidate failure state did not preserve normal block flow');
          if(entry.failed.bodyScrollHeight<=900)entry.failures.push('candidate source footer lost document overflow');
          if(!entry.failed.footer.painted||!entry.failed.footer.insideMain||entry.failed.footer.rect.top<899.99)entry.failures.push('candidate source footer did not remain in normal flow after the viewport-height chart');
          if(entry.failed.noticeVariables.mobile!=='0px'||entry.failed.noticeVariables.compare!==`${expectedNoticeHeight}px`)entry.failures.push('candidate compare notice height affected the existing mobile overlay variable');
        }
      }catch(error){entry.failures.push(error.stack||String(error));}
      finally{
        if(fixtureMounted){
          try{await evaluate(cdp,()=>{const fixture=window.__r12ControlledNoticeFixture;fixture.controller.update({phase:'idle',page:'compare'});fixture.controller.destroy();delete window.__r12ControlledNoticeFixture;});entry.restored=await settled(cdp,entry.id+' notice restored');if(entry.restored.notice.visible)entry.failures.push('notice did not return to idle after fixture disposal');if(variant.id==='candidate')entry.failures.push(...visibleFailures(entry.restored).map(value=>'restored: '+value));}catch(error){entry.failures.push('notice restoration: '+(error.stack||error));}
        }
      }
      if(width<=390&&entry.restored){
        const shift={status:'failed',failures:[],before:await settled(cdp,entry.id+' before stage shift')};entry.layoutShift=shift;
        let saved;
        try{
          saved=await evaluate(cdp,()=>{const stage=document.querySelector('.atlas-chart-stage');const saved={style:stage.getAttribute('style'),height:stage.getBoundingClientRect().height};stage.style.setProperty('max-height',`${saved.height-72}px`,'important');return saved;});
          shift.shifted=await settled(cdp,entry.id+' stage shifted');
          for(const key of ['toolbar','anchor']){for(const field of ['width','height'])if(!near(shift.before[key][field],shift.shifted[key][field]))shift.failures.push(`${key}.${field} changed`);if(!near(shift.shifted[key].top-shift.before[key].top,-72))shift.failures.push(`${key} did not move up 72px`);}
          shift.headingMovement=shift.shifted.heading.top-shift.before.heading.top;shift.anchorMovement=shift.shifted.anchor.top-shift.before.anchor.top;shift.staleMovementError=shift.headingMovement-shift.anchorMovement;
          shift.failures.push(...commonFailures(shift.shifted));
          if(variant.id==='baseline'){if(!near(shift.headingMovement,0)||!near(shift.staleMovementError,72))shift.failures.push('baseline did not retain stale coordinates when its anchor moved 72px');}
          else{shift.failures.push(...visibleFailures(shift.shifted));if(!near(shift.headingMovement,-72)||!near(shift.staleMovementError,0))shift.failures.push('candidate did not follow the full stage movement');}
        }catch(error){shift.failures.push(error.stack||String(error));}
        finally{
          if(saved){try{await evaluate(cdp,saved=>{const stage=document.querySelector('.atlas-chart-stage');if(saved.style===null)stage.removeAttribute('style');else stage.setAttribute('style',saved.style);},saved);shift.restored=await settled(cdp,entry.id+' stage restored');for(const key of ['toolbar','anchor','stage','plot'])for(const field of ['left','top','width','height'])if(!near(shift.before[key][field],shift.restored[key][field]))shift.failures.push(`restore ${key}.${field}`);if(variant.id==='candidate')shift.failures.push(...visibleFailures(shift.restored).map(value=>'restored: '+value));}catch(error){shift.failures.push('stage restoration: '+(error.stack||error));}}
        }
        shift.status=shift.failures.length?'failed':'passed';entry.failures.push(...shift.failures.map(value=>'stage regression: '+value));
      }
      // This explicit footer scroll is deliberately after the stage regression,
      // so it cannot refresh a stale baseline caption during that experiment.
      let bodyScrollBefore;
      try{
        bodyScrollBefore=await evaluate(cdp,()=>document.body.scrollTop);
        await evaluate(cdp,()=>{document.body.scrollTop=document.body.scrollHeight;});
        await evaluate(cdp,async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});
        entry.footerScroll=await evaluate(cdp,()=>{
          const footer=document.querySelector('#main>.footer'),r=footer.getBoundingClientRect(),box=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
          const walker=document.createTreeWalker(footer,NodeFilter.SHOW_TEXT),range=document.createRange(),textBoxes=[];
          while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.width>0&&rect.height>0)textBoxes.push({text:node.textContent.trim(),...box(rect)});}
          const controls=[...footer.querySelectorAll('button,a')].map(node=>({text:node.textContent.trim(),...box(node.getBoundingClientRect())}));
          const inViewport=rect=>rect.left>=-.01&&rect.top>=-.01&&rect.right<=innerWidth+.01&&rect.bottom<=innerHeight+.01;
          return {bodyTop:document.body.scrollTop,bodyMaximum:document.body.scrollHeight-document.body.clientHeight,footer:box(r),viewport:{width:innerWidth,height:innerHeight},visible:footer.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),textBoxes,controls,contentInViewport:textBoxes.length>0&&controls.length>0&&[...textBoxes,...controls].every(inViewport),fractionalPaddingOverflow:Math.max(0,r.bottom-innerHeight)};
        });
        // scrollHeight is integer-rounded, unlike the footer border box. Check
        // actual text/controls strictly; 0.046875px of blank bottom padding is
        // not inaccessible footer content. Match the existing scroll-end gate.
        if(entry.footerScroll.bodyMaximum<=0||Math.abs(entry.footerScroll.bodyTop-entry.footerScroll.bodyMaximum)>2||!entry.footerScroll.visible||!entry.footerScroll.contentInViewport)entry.failures.push('original source footer text/controls were not reachable at the document scroll end');
        entry.footerScreenshot=await screenshot(cdp,entry.id+'-footer-end.png');
      }catch(error){entry.failures.push('footer reachability: '+(error.stack||error));}
      finally{if(bodyScrollBefore!==undefined){try{await evaluate(cdp,value=>{document.body.scrollTop=value;},bodyScrollBefore);await evaluate(cdp,async()=>{for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);});entry.footerScrollRestored=await evaluate(cdp,()=>document.body.scrollTop);if(!near(entry.footerScrollRestored,bodyScrollBefore))entry.failures.push('document scroll was not restored');}catch(error){entry.failures.push('document scroll restoration: '+(error.stack||error));}}}
      const requests=new Map(cdp.events.filter(event=>event.method==='Network.requestWillBeSent').map(event=>[event.params.requestId,event.params.request.url]));
      entry.networkFailures=cdp.events.filter(event=>event.method==='Network.loadingFailed').map(event=>({url:requests.get(event.params.requestId),error:event.params.errorText,blockedReason:event.params.blockedReason}));
      entry.fontNetworkFailures=entry.networkFailures.filter(event=>/fonts\.(googleapis|gstatic)\.com/.test(event.url||''));
      if(entry.fontNetworkFailures.length)entry.failures.push('ordinary webfont loading failed; this is not the healthy-font A/B environment');
      entry.runtimeErrors=cdp.events.filter(event=>event.method==='Runtime.exceptionThrown').map(event=>event.params.exceptionDetails?.exception?.description||event.params.exceptionDetails?.text);
      entry.failures.push(...entry.runtimeErrors.map(value=>'runtime: '+value));
      entry.status=entry.failures.length?'failed':'passed';report.failures.push(...entry.failures.map(value=>entry.id+': '+value));
      console.log(JSON.stringify({id:entry.id,status:entry.status,noticeHeight:entry.failed?.notice.rect?.height,stageBottom:entry.failed?.stage.bottom,toolbarBottom:entry.failed?.toolbar.bottom,heading:entry.failed?.heading,stageMovementError:entry.layoutShift?.staleMovementError,failures:entry.failures}));
    }
    await new Promise(resolve=>currentServer.close(resolve));currentServer=null;
  }
  for(const width of [320,390,1440]){
    const baseline=report.cases.find(entry=>entry.id===`baseline-${width}`),candidate=report.cases.find(entry=>entry.id===`candidate-${width}`);
    const comparison={width,fontIdentityEqual:JSON.stringify(baseline?.fontsFailed)===JSON.stringify(candidate?.fontsFailed),baselineStageBottom:baseline?.failed?.stage.bottom,candidateStageBottom:candidate?.failed?.stage.bottom,baselineNoticeHeight:baseline?.failed?.notice.rect?.height,candidateNoticeHeight:candidate?.failed?.notice.rect?.height,baselineBodyScrollHeight:baseline?.failed?.bodyScrollHeight,candidateBodyScrollHeight:candidate?.failed?.bodyScrollHeight,footerHeightPreserved:near(baseline?.failed?.footer.rect?.height,candidate?.failed?.footer.rect?.height),footerTopDifference:baseline?.failed?.footer.rect?.top-candidate?.failed?.footer.rect?.top};report.comparisons.push(comparison);
    if(!comparison.fontIdentityEqual)report.failures.push(`A/B ${width}: rendered font identities differed`);
    if(!comparison.footerHeightPreserved||!near(comparison.footerTopDifference,comparison.candidateNoticeHeight))report.failures.push(`A/B ${width}: original footer geometry was not preserved after removing only the notice overflow`);
  }
}catch(error){report.failures.push('harness: '+(error.stack||String(error)));}
finally{
  cdp?.ws.close();browser?.ws.close();chrome?.kill('SIGKILL');if(currentServer)await new Promise(resolve=>currentServer.close(resolve));if(profile)await rm(profile,{recursive:true,force:true}).catch(error=>report.failures.push('profile cleanup: '+error.message));
  for(const variant of report.variants){try{variant.after=await identity(variant);variant.unchanged=JSON.stringify(variant.before)===JSON.stringify(variant.after);if(!variant.unchanged)report.failures.push(variant.id+': source identity changed during the A/B run');}catch(error){report.failures.push(variant.id+': source readback '+error.message);}}
  report.finishedAt=new Date().toISOString();report.counts={cases:report.cases.length,passed:report.cases.filter(entry=>entry.status==='passed').length,stageCases:report.cases.filter(entry=>entry.layoutShift).length,stagePassed:report.cases.filter(entry=>entry.layoutShift?.status==='passed').length};report.status=report.cases.length===6&&report.counts.stageCases===4&&report.failures.length===0?'passed':'failed';
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,counts:report.counts,failures:report.failures,out}));if(report.status!=='passed')process.exitCode=1;
}
