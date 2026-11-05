// Focused native regression for the mobile chart heading's period menu.
// Inputs use CDP pointer/key/touch events; no scrollIntoView or DOM scroll writes.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readNativeInteractiveTarget} from '../../../scripts/verify-workspace-browser.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const out=resolve(process.argv[2]||resolve(root,'build/cycle-menu-native'));
const {chromium}=await import(pathToFileURL(process.env.ATLAS_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
assert.ok(process.env.ATLAS_BROWSER_PATH,'ATLAS_BROWSER_PATH must name native Chromium');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const paths=['dist/index.html','dist/atlas-shell.css','dist/cycle-milestones.css','dist/lab.css','dist/mobile-workspace.js','dist/atlas-shell.js','dist/lab-view.js','scripts/verify-workspace-browser.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
const report={schemaVersion:1,kind:'mobile-cycle-menu-native',startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,probeSha256:hash(await readFile(fileURLToPath(import.meta.url))),viewport:{width:320,height:900,touch:true},scope:'Local actual chart and period menu, native Chromium input/layout only; not a provider refresh, physical-device or predictive-validity test.',states:[],inputs:[],runtimeErrors:[]};
await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname,path=resolve(root,'dist','.'+(name==='/'?'/index.html':name));if(!path.startsWith(resolve(root,'dist')+'/'))throw Error('path');const bytes=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser,page;
const complete=t=>t.painted&&!t.disabled&&t.topmost&&t.box.width>0&&t.box.height>0&&t.box.left>=t.clip.left-1&&t.box.right<=t.clip.right+1&&t.box.top>=t.clip.top-1&&t.box.bottom<=t.clip.bottom+1;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.ATLAS_BROWSER_PATH,args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});report.browserVersion=browser.version();
 const context=await browser.newContext({viewport:{width:320,height:900},hasTouch:true,isMobile:true,reducedMotion:'reduce',colorScheme:'dark'});page=await context.newPage();page.on('pageerror',error=>report.runtimeErrors.push(error.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/?symbol=BTCUSD&granularity=daily&type=line');
 await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.querySelectorAll('#lab-chart path').length>0);await page.evaluate(()=>document.fonts.ready);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 const state=async(label)=>{const value=await page.evaluate(()=>{const rect=r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});const heading=document.querySelector('.atlas-canvas-heading'),stage=document.querySelector('#lab-chart-stage'),menu=document.querySelector('.cycle-chart-menu');return {open:document.querySelector('#atlas-cycle-options').open,heading:{...rect(heading.getBoundingClientRect()),scrollLeft:heading.scrollLeft,scrollWidth:heading.scrollWidth,overflowX:getComputedStyle(heading).overflowX},stage:{...rect(stage.getBoundingClientRect()),scrollLeft:stage.scrollLeft,scrollTop:stage.scrollTop,scrollWidth:stage.scrollWidth},menu:{...rect(menu.getBoundingClientRect()),scrollTop:menu.scrollTop,scrollHeight:menu.scrollHeight,clientHeight:menu.clientHeight},perimeter:Object.fromEntries(['.atlas-canvas-heading','.workbench-bottom-bar','.atlas-sidebar','.workbench-rail'].map(selector=>[selector,rect(document.querySelector(selector).getBoundingClientRect())])),documentWidth:document.documentElement.scrollWidth};});report.states.push({label,...value});return value;};
 const initial=await state('initial');
 const stable=async(label)=>{const current=await state(label);assert.equal(current.stage.scrollLeft,0,label+' outer stage horizontal offset');assert.equal(current.stage.scrollTop,0,label+' outer stage vertical offset');assert.ok(current.documentWidth<=321,label+' document overflow');assert.deepEqual(current.perimeter,initial.perimeter,label+' perimeter moved');return current;};
 const pointer=async(selector)=>{const target=await page.evaluate(readNativeInteractiveTarget,selector);report.inputs.push({kind:'native-pointer',selector,target});assert.ok(complete(target),'Clipped or occluded target '+JSON.stringify(target));for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:target.x,y:target.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await page.waitForTimeout(160);};
 const key=async(value,code,number)=>{report.inputs.push({kind:'native-key',value,code});await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,...(value==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number});await page.waitForTimeout(120);};
 // Reach the header's later controls with a gesture originating on its icons.
 const heading=initial.heading,y=(heading.top+heading.bottom)/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y,id:1}]});
 for(let step=1;step<=12;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280-step*12,y,id:1}]});await page.waitForTimeout(16);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
 const reached=await stable('after-native-heading-pan');assert.ok(reached.heading.scrollLeft>initial.heading.scrollLeft,'Native heading gesture must scroll its owner');report.inputs.push({kind:'native-touch-pan',from:280,to:136,y,before:initial.heading.scrollLeft,after:reached.heading.scrollLeft});
 await pointer('#atlas-cycle-options > summary');await page.waitForFunction(()=>document.querySelector('#atlas-cycle-options').open);
 await stable('pointer-open');
 report.menuTarget=await page.evaluate(readNativeInteractiveTarget,'.cycle-chart-menu');assert.ok(complete(report.menuTarget),'Open cycle menu must be fully visible');
 for(const selector of ['#atlas-cycle-toggle','#atlas-cycle-relation','#atlas-cycle-overview']){const target=await page.evaluate(readNativeInteractiveTarget,selector);assert.ok(complete(target),'Menu control must be reachable: '+selector);report.inputs.push({kind:'native-geometry',selector,target});}
 // Toggle and restore through the actual handler while the menu stays open.
 const pressed=await page.getAttribute('#atlas-cycle-toggle','aria-pressed');await pointer('#atlas-cycle-toggle');assert.notEqual(await page.getAttribute('#atlas-cycle-toggle','aria-pressed'),pressed);await pointer('#atlas-cycle-toggle');assert.equal(await page.getAttribute('#atlas-cycle-toggle','aria-pressed'),pressed);
 await page.screenshot({path:resolve(out,'cycle-menu-open-320.png')});
 // Reach the final disclosure through the menu's own native vertical scroll.
 const endSelector='.cycle-chart-menu > .cycle-reference > summary';
 for(let attempt=0;attempt<12;attempt++){
  const target=await page.evaluate(readNativeInteractiveTarget,endSelector);
  if(complete(target)){report.inputs.push({kind:'native-end-control',selector:endSelector,target});break;}
  const owner=await page.locator('.cycle-chart-menu').boundingBox();
  const input={type:'mouseWheel',x:owner.x+owner.width/2,y:owner.y+owner.height/2,deltaX:0,deltaY:220};
  report.inputs.push({kind:'native-menu-wheel',...input});await cdp.send('Input.dispatchMouseEvent',input);await page.waitForTimeout(120);
 }
 const endTarget=await page.evaluate(readNativeInteractiveTarget,endSelector);assert.ok(complete(endTarget),'Final menu disclosure must be reachable by native menu scroll');
 const menuEnd=await stable('menu-scroll-end');assert.ok(menuEnd.menu.scrollTop>0,'Cycle menu must own vertical scrolling');
 await pointer(endSelector);assert.equal(await page.locator('.cycle-chart-menu > .cycle-reference').evaluate(el=>el.open),true);
 await pointer(endSelector);assert.equal(await page.locator('.cycle-chart-menu > .cycle-reference').evaluate(el=>el.open),false);
 await stable('final-disclosure-restored');
 await key('Escape','Escape',27);assert.equal(await page.locator('#atlas-cycle-options').evaluate(el=>el.open),false);await stable('escape-close');
 // Reopen, close, and reopen by the actual focused summary's keyboard behavior.
 await pointer('#atlas-cycle-options > summary');assert.equal(await page.locator('#atlas-cycle-options').evaluate(el=>el.open),true);assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#atlas-cycle-options > summary')),true);
 await key('Enter','Enter',13);assert.equal(await page.locator('#atlas-cycle-options').evaluate(el=>el.open),false);await stable('keyboard-close');
 await key('Enter','Enter',13);assert.equal(await page.locator('#atlas-cycle-options').evaluate(el=>el.open),true);await stable('keyboard-open');
 await key('Escape','Escape',27);assert.equal(await page.locator('#atlas-cycle-options').evaluate(el=>el.open),false);await stable('final-close');
 assert.equal(report.runtimeErrors.length,0);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;if(page)await page.screenshot({path:resolve(out,'cycle-menu-failure-320.png')}).catch(()=>{});
}finally{
 if(browser)await browser.close();await new Promise(done=>server.close(done));
 report.finalSourceHashes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 report.sourcesUnchangedDuringRun=JSON.stringify(report.finalSourceHashes)===JSON.stringify(sourceHashes);if(!report.sourcesUnchangedDuringRun){report.status='failed';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,sourceHashes:report.sourceHashes,browserVersion:report.browserVersion,states:report.states.map(s=>({label:s.label,open:s.open,heading:s.heading,stage:s.stage})),runtimeErrors:report.runtimeErrors,sourcesUnchangedDuringRun:report.sourcesUnchangedDuringRun,error:report.error,out}));
}
