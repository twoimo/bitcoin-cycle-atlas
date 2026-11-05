/** Revision2: add colored alpha-zero paint to the original native preview negative controls.
 * Run: ATLAS_BROWSER_PATH=/path/to/chromium ATLAS_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node docs/deep-audit-2026-11-05/evidence/verify-preview-native-alpha.mjs /path/to/output
 * Frozen preview rendering is not a measurement of real loading time or device performance.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readPreviewBootSurface,assertPreviewBootSurface} from '../../../scripts/verify-workspace-browser.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=resolve(process.argv[2]||resolve(root,'build/followup-preview-negative'));
const browserPath=process.env.ATLAS_BROWSER_PATH;
assert.ok(browserPath,'ATLAS_BROWSER_PATH is required; missing native Chrome is a blocked test, not a pass.');
const {chromium}=await import(pathToFileURL(process.env.ATLAS_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=['scripts/verify-workspace-browser.mjs','dist/mobile-preview.html','dist/mobile-preview.js','dist/index.html','dist/loading-surfaces.css','dist/vendor/skullet/styles.css'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const report={schemaVersion:1,kind:'preview-native-negative-controls',startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),nodeVersion:process.version,sourceHashes,probeSha256:hash(await readFile(fileURLToPath(import.meta.url))),cases:[],unexpectedPasses:[],scope:'Actual local mobile-preview.html, actual exported measurement and assertions, native Chromium, neutral frozen loading/error previews; no provider refresh, deployment, timing, model-promotion or physical-device claim.'};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname,path=resolve(root,'dist','.'+(name==='/'?'/index.html':name));if(!path.startsWith(resolve(root,'dist')+'/'))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const mutants=[
 {id:'loading-paint-hidden',mode:'loading',selector:'.atlas-boot-readout .atlas-boot-bar,.atlas-boot-indicators .atlas-boot-bar',attribute:'style',value:'display:none!important',screenshot:true},
 {id:'loading-paint-colored-alpha-zero',mode:'loading',selector:'.atlas-boot-readout .atlas-boot-bar,.atlas-boot-indicators .atlas-boot-bar',attribute:'style',value:'background:rgba(255,0,0,0)!important',screenshot:true},
 {id:'loading-status-role-removed',mode:'loading',selector:'#atlas-boot-status',attribute:'role',value:null},
 {id:'loading-status-live-removed',mode:'loading',selector:'#atlas-boot-status',attribute:'aria-live',value:null},
 {id:'loading-status-busy-removed',mode:'loading',selector:'#atlas-boot-status',attribute:'aria-busy',value:null},
 {id:'loading-status-aria-excluded',mode:'loading',selector:'#atlas-boot-status',attribute:'aria-hidden',value:'true'},
 {id:'loading-status-css-excluded',mode:'loading',selector:'#atlas-boot-status',attribute:'style',value:'display:none!important'},
 {id:'loading-status-visibility-excluded',mode:'loading',selector:'#atlas-boot-status',attribute:'style',value:'visibility:hidden!important'},
 {id:'loading-status-css-ancestor-excluded',mode:'loading',selector:'.atlas-boot-message',attribute:'style',value:'display:none!important'},
 {id:'loading-status-content-ancestor-excluded',mode:'loading',selector:'.atlas-boot-message',attribute:'style',value:'content-visibility:hidden'},
 {id:'error-retry-hidden',mode:'error',selector:'#atlas-boot-retry',attribute:'hidden',value:'',screenshot:true},
 {id:'error-retry-disabled',mode:'error',selector:'#atlas-boot-retry',attribute:'disabled',value:'',screenshot:true}
];
let context,profile;
async function screenshot(page,name,receipt){const path=resolve(out,name);await page.screenshot({path});const bytes=await readFile(path);receipt.screenshots.push({file:name,bytes:bytes.length,sha256:hash(bytes)});}
function condensed(state){return {mode:state.mode,boot:state.boot,shellHidden:state.shellHidden,statusHidden:state.statusHidden,errorHidden:state.errorHidden,kind:state.active?.kind,status:state.active?.status,paint:state.active?.paint?.map(p=>({rendered:p.rendered,visibleWidth:p.visibleWidth,visibleHeight:p.visibleHeight,background:p.background,decorative:p.decorative})),retry:state.active?.retry};}
try{
 for(const width of [320,1440]){
  profile=await mkdtemp('/tmp/atlas-preview-negative-');context=await chromium.launchPersistentContext(profile,{viewport:{width,height:900},hasTouch:width===320,headless:true,executablePath:browserPath,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});
  report.browserVersion=context.browser().version();const page=await context.newPage();
  const receipt={width,height:900,touch:width===320,runtimeErrors:[],positive:[],negative:[],screenshots:[]};report.cases.push(receipt);page.on('pageerror',e=>receipt.runtimeErrors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/mobile-preview.html');
  await page.waitForFunction(()=>document.querySelector('#mobile-preview')?.contentDocument?.documentElement?.dataset.boot==='ready');
  async function mode(value){await page.selectOption('#preview-mode',value);await page.waitForFunction(value=>{const f=document.querySelector('#mobile-preview');return !f.hidden&&f.contentDocument?.documentElement?.dataset.boot===(value==='actual'?'ready':value);},value);await page.waitForTimeout(150);return page.evaluate(readPreviewBootSurface,value);}
  for(const value of ['loading','error']){
   const initial=await mode(value);assertPreviewBootSurface(initial);receipt.positive.push({state:value,...condensed(initial)});await screenshot(page,`preview-${width}-${value}-original.png`,receipt);
   for(const mutation of mutants.filter(m=>m.mode===value)){
    const originals=await page.evaluate(m=>{const doc=document.querySelector('#mobile-preview').contentDocument,nodes=[...doc.querySelectorAll(m.selector)];if(!nodes.length)throw Error('Missing mutation target '+m.selector);return nodes.map(el=>{const original=el.getAttribute(m.attribute);if(m.value===null)el.removeAttribute(m.attribute);else el.setAttribute(m.attribute,m.value);return original;});},mutation);
    const changed=await page.evaluate(readPreviewBootSurface,value);let rejected=false,error=null;
    try{assertPreviewBootSurface(changed);}catch(e){rejected=true;error=e.message;}
    const result={id:mutation.id,rejected,error,measured:condensed(changed)};receipt.negative.push(result);
    if(!rejected)report.unexpectedPasses.push({width,id:mutation.id});
    if(mutation.screenshot)await screenshot(page,`preview-${width}-${mutation.id}.png`,receipt);
    await page.evaluate(({mutation,originals})=>{const nodes=[...document.querySelector('#mobile-preview').contentDocument.querySelectorAll(mutation.selector)];nodes.forEach((el,i)=>{if(originals[i]===null)el.removeAttribute(mutation.attribute);else el.setAttribute(mutation.attribute,originals[i]);});},{mutation,originals});
    assertPreviewBootSurface(await page.evaluate(readPreviewBootSurface,value));result.restoredPass=true;
   }
  }
  const actual=await mode('actual');assertPreviewBootSurface(actual);receipt.positive.push({state:'actual',...condensed(actual)});
  await page.waitForFunction(()=>document.querySelector('#mobile-preview').contentDocument.querySelectorAll('#lab-chart path').length>0);receipt.actualChartPaths=await page.evaluate(()=>document.querySelector('#mobile-preview').contentDocument.querySelectorAll('#lab-chart path').length);
  assert.equal(receipt.runtimeErrors.length,0);receipt.status='complete';await context.close();context=null;await rm(profile,{recursive:true,force:true});profile=null;
 }
 const finalHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 report.sourcesUnchangedDuringRun=JSON.stringify(finalHashes)===JSON.stringify(sourceHashes);assert.equal(report.sourcesUnchangedDuringRun,true,'Measured source changed during verification');
 assert.equal(report.unexpectedPasses.length,0,'A broken preview state incorrectly passed the actual assertion boundary');report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}finally{if(context)await context.close();if(profile)await rm(profile,{recursive:true,force:true});await new Promise(done=>server.close(done));report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browserVersion:report.browserVersion,cases:report.cases.map(c=>({width:c.width,positive:c.positive.length,negative:c.negative.map(n=>({id:n.id,rejected:n.rejected,restoredPass:n.restoredPass})),runtimeErrors:c.runtimeErrors})),unexpectedPasses:report.unexpectedPasses,report:relative(root,resolve(out,'report.json')),error:report.error}));}
