/** Native BTC indicator surface negative controls. No production DOM mutation is retained.
 * ATLAS_BROWSER_PATH=/path/to/chromium node docs/deep-audit-2026-11-05/evidence/verify-indicator-native.mjs /path/to/output
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve,extname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readIndicatorLegendSurface,assertIndicatorLegendSurface} from '../../../scripts/verify-workspace-browser.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),out=resolve(process.argv[2]||resolve(root,'build/followup-indicator-negative'));
const browserPath=process.env.ATLAS_BROWSER_PATH;assert.ok(browserPath,'ATLAS_BROWSER_PATH is required');
const {chromium}=await import(pathToFileURL(process.env.ATLAS_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out,{recursive:true});const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=['scripts/verify-workspace-browser.mjs','dist/indicator-workbench.js','dist/indicator-state.js','dist/compact-chart-layout.css','dist/chart-workspace-controls.css','dist/atlas-shell.css','dist/mobile-workspace.css','dist/styles.css','dist/index.html','dist/app.js','dist/data/btc-daily.json'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const report={schemaVersion:1,kind:'indicator-native-negative-controls',startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),nodeVersion:process.version,sourceHashes,probeSha256:hash(await readFile(fileURLToPath(import.meta.url))),cases:[],scope:'Actual local BTC chart and original exported indicator measurement/assertions in native Chromium. External requests blocked; no provider refresh, data mutation, forecast revision, deployment or predictive-validity claim.'};
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname,path=resolve(root,'dist','.'+(name==='/'?'/index.html':name));if(!path.startsWith(resolve(root,'dist')+'/'))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let context,profile;
async function screenshot(page,name,receipt){const path=resolve(out,name);await page.screenshot({path});const bytes=await readFile(path);receipt.screenshots.push({file:name,bytes:bytes.length,sha256:hash(bytes)});}
try{
 for(const spec of [{width:320,height:900,touch:true},{width:1440,height:900,touch:false},{width:900,height:430,touch:true}]){
  profile=await mkdtemp('/tmp/atlas-indicator-negative-');context=await chromium.launchPersistentContext(profile,{viewport:{width:spec.width,height:spec.height},hasTouch:spec.touch,headless:true,executablePath:browserPath,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});
  report.browserVersion=context.browser().version();const page=await context.newPage(),receipt={...spec,positive:[],negative:[],screenshots:[],runtimeErrors:[]};report.cases.push(receipt);page.on('pageerror',e=>receipt.runtimeErrors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/?symbol=BTCUSD&granularity=daily&type=line');
  await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.querySelectorAll('#lab-chart path').length>0&&document.querySelectorAll('#chart-indicator-list .indicator-label').length>0);
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
  const measure=()=>page.evaluate(readIndicatorLegendSurface);
  const validate=async id=>{const state=await measure();assertIndicatorLegendSurface(state);receipt.positive.push({id,state});return state;};
  const initial=await validate('original');await screenshot(page,`indicator-${spec.width}x${spec.height}-original.png`,receipt);
  async function mutate(id,selector,style,expectedMessage){
   const saved=await page.evaluate(({selector,style})=>{const nodes=[...document.querySelectorAll(selector)];if(!nodes.length)throw Error('Missing mutation '+selector);return nodes.map(el=>{const original=el.getAttribute('style');el.setAttribute('style',style);return original;});},{selector,style});
   const measured=await measure();let rejected=false,error=null;
   try{assertIndicatorLegendSurface(measured);}catch(e){rejected=true;error=e.message;}
   const result={id,measured,rejected,error};receipt.negative.push(result);
   assert.equal(rejected,true,'Broken indicator state passed: '+id);assert.match(error,expectedMessage);
   await screenshot(page,`indicator-${spec.width}x${spec.height}-${id}.png`,receipt);
   await page.evaluate(({selector,saved})=>{[...document.querySelectorAll(selector)].forEach((el,i)=>{if(saved[i]===null)el.removeAttribute('style');else el.setAttribute('style',saved[i]);});},{selector,saved});
   assertIndicatorLegendSurface(await measure());result.restoredPass=true;
  }
  await mutate('manager-opaque','#chart-indicator-manager','background:rgb(19,25,34)!important',/Indicator manager must retain/);
  if(!initial.collapsed){await page.locator('#indicator-legend-toggle').click();await page.waitForFunction(()=>document.querySelector('#chart-indicator-manager').dataset.collapsed==='true');}
  const collapsed=await validate('collapsed');assert.equal(collapsed.listHidden,true);
  await mutate('collapsed-list-opaque','#chart-indicator-list','background:rgb(19,25,34)!important',/Indicator list must retain/);
  if(!initial.mobile){
   await page.locator('#indicator-legend-toggle').click();await page.waitForFunction(()=>document.querySelector('#chart-indicator-manager').dataset.collapsed==='false');
   const expanded=await validate('expanded');assert.equal(expanded.collapsed,false);await screenshot(page,`indicator-${spec.width}x${spec.height}-expanded.png`,receipt);
   await mutate('expanded-list-opaque','#chart-indicator-list','background:rgb(19,25,34)!important',/Indicator list must retain/);
   await mutate('expanded-label-colored-alpha-zero','#chart-indicator-list .indicator-label','color:rgba(255,0,0,0)!important',/Expanded indicator labels are missing/);
  }else receipt.expandedLabelControl='Not applicable: the real mobile legend is deliberately collapsed with disabled toggle and an indicator-menu label.';
  const saved=await page.evaluate(()=>[...document.querySelectorAll('#chart-indicator-manager,#chart-indicator-list')].map(el=>{const original=el.getAttribute('style');el.style.setProperty('background','rgba(255,0,0,0)','important');return original;}));
  await validate('colored-transparent-manager-and-list');
  await page.evaluate(saved=>{[...document.querySelectorAll('#chart-indicator-manager,#chart-indicator-list')].forEach((el,i)=>{if(saved[i]===null)el.removeAttribute('style');else el.setAttribute('style',saved[i]);});},saved);
  if((await measure()).collapsed!==initial.collapsed){await page.locator('#indicator-legend-toggle').click();}
  const restored=await validate('restored-original');assert.equal(restored.collapsed,initial.collapsed);assert.equal(receipt.runtimeErrors.length,0);receipt.status='passed';
  await context.close();context=null;await rm(profile,{recursive:true,force:true});profile=null;
 }
 const finalHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 report.sourcesUnchangedDuringRun=JSON.stringify(finalHashes)===JSON.stringify(sourceHashes);assert.equal(report.sourcesUnchangedDuringRun,true,'Source changed during native verification');report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}finally{if(context)await context.close();if(profile)await rm(profile,{recursive:true,force:true});await new Promise(done=>server.close(done));report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browserVersion:report.browserVersion,cases:report.cases.map(c=>({width:c.width,height:c.height,status:c.status,negative:c.negative.map(n=>({id:n.id,rejected:n.rejected,restoredPass:n.restoredPass})),runtimeErrors:c.runtimeErrors})),report:relative(root,resolve(out,'report.json')),error:report.error}));}
