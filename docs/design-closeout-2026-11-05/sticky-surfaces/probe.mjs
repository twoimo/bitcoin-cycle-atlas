import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Focused native interaction receipt, separate from the pinned Hallmark gates.
// The before run serves every requested file from the named immutable Git tree.
const root=fileURLToPath(new URL('../../../',import.meta.url));
const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const baseline='624888270fcb539ab08d505e5affab5f5d435776';
const phase=arg('phase')||'before',reference=arg('reference')||(phase==='before'?baseline:null);
const output=path.resolve(root,arg('out')||'docs/design-closeout-2026-11-05/sticky-surfaces/'+phase);
const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const binary=process.env.ATLAS_BROWSER_PATH||'/workspace/scratch/82e52cfd9693/browser-native/chromium-audit-multiprocess';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=new Map(),served=new Map();
async function source(file){
  if(files.has(file))return files.get(file);
  const bytes=reference?execFileSync('git',['show',reference+':'+file],{cwd:root,maxBuffer:50*1024*1024,stdio:['ignore','pipe','ignore']}):await readFile(path.join(root,file));
  files.set(file,bytes);return bytes;
}
const report={schemaVersion:1,kind:'native-scroll-owner-closeout',phase,baseline,sourceReference:reference||'working-tree',
  startedAt:new Date().toISOString(),status:'running',cases:[],runtimeErrors:[],resourceFailures:[],sourceHashes:{},servedHashes:{},
  method:'Unmodified app served by one local HTTP server; real Chromium mouse, wheel and keyboard input. Read-only DOM geometry; no injected table data or scripted scrolling. Offline external requests are blocked and listed.'};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon','.csv':'text/csv'};
const server=createServer(async(req,res)=>{
  try{
    let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/bitcoin-cycle-atlas(?=\/|$)/,'');
    if(p.endsWith('/'))p+='index.html';if(!p)p='/index.html';
    const file=path.posix.normalize('dist'+p);if(!file.startsWith('dist/'))throw new Error('invalid path');
    const bytes=await source(file);served.set(file,sha(bytes));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end('Not found');}
});
let browser;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await delay(120);}
async function waitFor(fn,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(150);}throw new Error('Timed out: '+label);}
async function target(page,selector){return page.evaluate(s=>{
  const el=document.querySelector(s);if(!el)throw new Error('Missing '+s);
  const b=el.getBoundingClientRect(),css=getComputedStyle(el),x=b.x+b.width/2,y=b.y+b.height/2,hit=document.elementFromPoint(x,y);
  return {selector:s,x,y,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,
    visible:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),topmost:!!hit&&(hit===el||el.contains(hit)),disabled:!!el.disabled,
    viewportWidth:innerWidth,viewportHeight:innerHeight,outline:css.outlineStyle,outlineWidth:parseFloat(css.outlineWidth),
    label:el.getAttribute('aria-label')||el.textContent.slice(0,60)};
},selector);}
function reachable(t){return t.visible&&!t.disabled&&t.topmost&&t.width>0&&t.height>0&&t.left>=0&&t.right<=t.viewportWidth&&t.top>=0&&t.bottom<=t.viewportHeight;}
async function click(page,selector,receipt){const t=await target(page,selector);assert.ok(reachable(t),'Native pointer target unreachable '+JSON.stringify(t));receipt.inputs.push({kind:'pointer',target:t});await page.mouse.click(t.x,t.y);await settle(page);}
async function wheel(page,selector,dx,dy,receipt){const b=await target(page,selector);const x=Math.max(12,Math.min(b.viewportWidth-12,(Math.max(0,b.left)+Math.min(b.viewportWidth,b.right))/2)),y=Math.max(12,Math.min(b.viewportHeight-12,(Math.max(0,b.top)+Math.min(b.viewportHeight,b.bottom))/2));const hit=await page.evaluate(({x,y})=>{let el=document.elementFromPoint(x,y),a=[];for(let i=0;el&&i<6;i++,el=el.parentElement)a.push(el.tagName+'.'+el.className);return a;},{x,y});receipt.inputs.push({kind:'wheel',selector,x,y,dx,dy,hit});await page.mouse.move(x,y);await page.mouse.wheel(dx,dy);await settle(page);}
async function key(page,value,receipt){receipt.inputs.push({kind:'keyboard',key:value});await page.keyboard.press(value);await settle(page);}
async function revealToolbar(page,selector,receipt){
  for(let i=0;i<12;i++){const t=await target(page,selector);if(reachable(t))return;await wheel(page,'.atlas-canvas-heading',t.left<0?-180:180,0,receipt);}
  throw new Error('Toolbar did not reveal '+selector);
}
async function revealScroll(page,selector,owner,receipt){
  for(let i=0;i<16;i++){const t=await target(page,selector);if(reachable(t))return;await wheel(page,owner,0,Math.max(-640,Math.min(640,t.top-t.viewportHeight*.3)),receipt);}
  throw new Error('Native scroll did not reveal '+selector+' '+JSON.stringify(await target(page,selector)));
}
async function screenshot(page,name,receipt){const file=name+'.png';await page.screenshot({path:path.join(output,file)});receipt.screenshots.push({file,sha256:sha(await readFile(path.join(output,file)))});}
async function geometry(page,ownerSelector){return page.evaluate(s=>{
  const owner=document.querySelector(s),table=owner.querySelector('table'),head=table.querySelector('thead th'),first=table.querySelector('tbody th,tbody td'),row=first?.closest('tr');
  const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
  const o=rect(owner);return {ownerSelector:s,owner:o,clientTop:o.top+owner.clientTop,clientLeft:o.left+owner.clientLeft,
    scrollTop:owner.scrollTop,scrollLeft:owner.scrollLeft,maxScrollTop:owner.scrollHeight-owner.clientHeight,maxScrollLeft:owner.scrollWidth-owner.clientWidth,
    rows:table.tBodies[0].rows.length,head:rect(head),headPosition:getComputedStyle(head).position,headTop:getComputedStyle(head).top,
    first:first?rect(first):null,firstPosition:first?getComputedStyle(first).position:null,firstText:first?.textContent,
    row:row?rect(row):null,bodyScroll:{x:document.documentElement.scrollLeft,y:document.documentElement.scrollTop}};
},ownerSelector);}
function assertHeader(g){assert.ok(g.scrollTop>5,'Vertical native scroll not exercised');assert.ok(Math.abs(g.head.top-g.clientTop)<=2,'Header lost actual scroll owner '+JSON.stringify(g));}
function assertFirstColumn(g){assert.ok(g.scrollLeft>5,'Horizontal native scroll not exercised');assert.ok(Math.abs(g.first.left-g.clientLeft)<=2,'Identity cell lost actual scroll owner '+JSON.stringify(g));}
async function ledger(page,selector,label,receipt){
  const item={label,before:await geometry(page,selector)};receipt.ledgers.push(item);assert.ok(item.before.rows>=10,'Need real populated ledger');assert.ok(item.before.maxScrollTop>100,'Need overflowing ledger');
  const plotHash=async()=>sha(await page.locator('#lab-chart .observed-close-line').getAttribute('d'));
  item.pricePathBefore=await plotHash();await wheel(page,selector,0,380,receipt);item.vertical=await geometry(page,selector);item.pricePathAfterWheel=await plotHash();
  if(phase==='before'&&item.vertical.scrollTop===item.before.scrollTop&&item.pricePathBefore!==item.pricePathAfterWheel){
    item.reproducedIssue='Chart controller captures native wheel over a child dialog plain cell';
    receipt.knownIssues??=[];receipt.knownIssues.push(item.reproducedIssue);
    let focused=false;for(let step=0;step<20;step++){await key(page,'Tab',receipt);if(await page.evaluate(s=>document.activeElement===document.querySelector(s),selector)){focused=true;break;}}
    assert.ok(focused,'Tab never reached clock scroll owner');await key(page,'PageDown',receipt);item.keyboardFallback=await geometry(page,selector);assertHeader(item.keyboardFallback);
  }else{assertHeader(item.vertical);assert.equal(item.pricePathAfterWheel,item.pricePathBefore,'Native ledger wheel changed underlying price curve');}
  if(item.before.maxScrollLeft>20){
    await wheel(page,selector,320,0,receipt);item.bothAxes=await geometry(page,selector);
    if(item.reproducedIssue&&item.bothAxes.scrollLeft===0){await key(page,'ArrowRight',receipt);await key(page,'ArrowRight',receipt);item.horizontalKeyboardFallback=await geometry(page,selector);assertHeader(item.horizontalKeyboardFallback);assertFirstColumn(item.horizontalKeyboardFallback);}
    else{assertHeader(item.bothAxes);assertFirstColumn(item.bothAxes);}
  }
  if(phase!=='before'&&label==='monthly'){
    const style=await page.addStyleTag({content:selector+' thead th{position:static!important}'});
    item.negativeControl={kind:'temporary in-memory removal of vertical sticky behavior',geometry:await geometry(page,selector),detected:false};
    try{assertHeader(item.negativeControl.geometry);}catch{item.negativeControl.detected=true;}
    await style.evaluate(el=>el.remove());assert.equal(item.negativeControl.detected,true,'Geometry oracle accepted a broken header');assertHeader(await geometry(page,selector));
  }
  // Native tab order must reach the actual focusable scroll region from the close action.
  await click(page,'.monthly-backtest:not([hidden]) .monthly-heading > button:last-child',receipt);
  item.closed=true;
}
async function contrastCase(page,base,receipt){
  await page.goto(base+'?page=compare&legacy=1');await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.body.dataset.page==='compare');await settle(page);
  await revealScroll(page,'#legacy-comparison > summary','body',receipt);await click(page,'#legacy-comparison > summary',receipt);
  await revealScroll(page,'#export-button','body',receipt);
  const exportTarget=await target(page,'#export-button');if(exportTarget.top>300)await wheel(page,'body',0,exportTarget.top-200,receipt);
  await click(page,'#export-button',receipt);await click(page,'#export-menu [data-method]',receipt);
  await page.waitForFunction(()=>!document.querySelector('#chart-reader').hidden&&document.querySelector('#chart-reader').dataset.kind==='method');
  const readContrast=()=>{
    const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
    const read=el=>{const css=getComputedStyle(el);let ancestor=el,background=css.backgroundColor;while(ancestor&&background==='rgba(0, 0, 0, 0)'){ancestor=ancestor.parentElement;if(ancestor)background=getComputedStyle(ancestor).backgroundColor;}const l1=lum(css.color),l2=lum(background);return {selector:el.tagName+'.'+el.className,foreground:css.color,background:css.backgroundColor,effectiveBackground:background,ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),fontSize:css.fontSize,rendered:el.checkVisibility({checkVisibilityCSS:true}),text:el.textContent.slice(0,100)};};
    const fixture=document.createElement('div');fixture.className='lab-error';fixture.textContent='Isolated CSS contrast sample';document.body.append(fixture);const error=read(fixture);fixture.remove();
    return {theme:document.documentElement.dataset.theme,formula:[...document.querySelectorAll('#method-dialog code,#method-dialog .method-formula')].map(read),liveReader:[...document.querySelectorAll('#chart-reader code,#chart-reader .method-formula')].map(read),
      surfaces:[...document.querySelectorAll('.chart-card,.method-card,.reading-card,.data-panel')].map(read),labErrorCssFixture:{method:'Temporary .lab-error node with the actual loaded CSS; not a reproduced app error state',...error}};
  };
  receipt.contrast=await page.evaluate(readContrast);receipt.contrast.livePages=[receipt.contrast.liveReader];
  for(let i=0;i<6&&!await page.locator('#chart-reader .method-formula').count();i++){
    if(await page.locator('#chart-reader [aria-label="다음 설명 페이지"]').isDisabled())break;
    await click(page,'#chart-reader [aria-label="다음 설명 페이지"]',receipt);receipt.contrast.livePages.push((await page.evaluate(readContrast)).liveReader);
  }
  for(const sample of receipt.contrast.formula)assert.ok(sample.ratio>=4.5,'Computed formula contrast below 4.5 '+JSON.stringify(sample));
  assert.ok(receipt.contrast.labErrorCssFixture.ratio>=4.5,'CSS error token contrast below 4.5');
  for(const sample of receipt.contrast.livePages.flat())assert.ok(sample.ratio>=4.5&&sample.rendered,'Live reader contrast below 4.5 '+JSON.stringify(sample));
  await screenshot(page,'formula-contrast-'+receipt.width,receipt);await key(page,'Escape',receipt);
}
async function focusByTab(page,selector,receipt,limit=20){
  for(let i=0;i<limit;i++){await key(page,'Tab',receipt);if(await page.evaluate(s=>document.activeElement===document.querySelector(s),selector))return;}
  throw new Error('Native Tab did not reach '+selector);
}
async function appLedger(page,selector,label,receipt){
  const item={label,before:await geometry(page,selector)};receipt.appLedgers??=[];receipt.appLedgers.push(item);
  assert.ok(item.before.rows>10&&item.before.maxScrollTop>100,'Need populated overflowing '+label);
  await key(page,'PageDown',receipt);item.keyboard=await geometry(page,selector);assertHeader(item.keyboard);
  await wheel(page,selector,0,220,receipt);item.wheel=await geometry(page,selector);assertHeader(item.wheel);
  assert.ok(item.wheel.scrollTop>item.keyboard.scrollTop||item.wheel.scrollTop===item.wheel.maxScrollTop,'Native wheel did not advance '+label);
  if(item.before.maxScrollLeft>10){await wheel(page,selector,240,0,receipt);item.bothAxes=await geometry(page,selector);assertHeader(item.bothAxes);assert.ok(item.bothAxes.scrollLeft>0,'Native horizontal scroll did not advance '+label);}
  await screenshot(page,label+'-'+receipt.width,receipt);
}
async function embeddedAppCases(page,base,receipt){
  await page.goto(base+'market-lab/app/?embedded=1&lab-tab=rsi&symbol=TQQQ');
  await page.locator('.rsi-workbench-tabs button:nth-child(3)').waitFor();await settle(page);
  await click(page,'.rsi-workbench-tabs button:nth-child(3)',receipt);
  await page.locator('.rsi-ledger-scroll tbody tr').first().waitFor();
  // A real row action provides keyboard access to the surrounding native scroller.
  await focusByTab(page,'.rsi-ledger-scroll tbody button',receipt,30);await appLedger(page,'.rsi-ledger-scroll','rsi-history',receipt);
  await page.goto(base+'market-lab/app/?embedded=1&lab-tab=housing');
  await page.locator('#housing-tab-chart').waitFor();await settle(page);
  await click(page,'#housing-tab-chart',receipt);await key(page,'End',receipt);
  await page.locator('#housing-view-history .housing-ledger tbody tr').first().waitFor();
  await focusByTab(page,'#housing-view-history .housing-ledger',receipt);await appLedger(page,'#housing-view-history .housing-ledger','housing-history',receipt);
}
async function symbolCase(page,receipt){
  await revealToolbar(page,'.workbench-symbol',receipt);await click(page,'.workbench-symbol',receipt);
  await waitFor(()=>page.locator('.symbol-search-dialog').evaluate(el=>el.open),'symbol dialog open');
  const read=()=>page.evaluate(()=>{
    const owner=document.querySelector('.symbol-search-dialog'),head=owner.querySelector('.symbol-search-heading'),close=owner.querySelector('.symbol-search-close'),selected=owner.querySelector('[aria-selected="true"]');
    const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
    const d=rect(owner);return {owner:d,head:rect(head),close:rect(close),scrollTop:owner.scrollTop,maxScroll:owner.scrollHeight-owner.clientHeight,headPosition:getComputedStyle(head).position,
      clientTop:d.top+owner.clientTop,selected:selected?{symbol:selected.dataset.symbol,...rect(selected)}:null,active:document.activeElement.id||document.activeElement.className};
  });
  receipt.symbol={before:await read()};
  for(let i=0;i<3;i++)await key(page,'ArrowDown',receipt);
  receipt.symbol.keyboard=await read();
  const k=receipt.symbol.keyboard;assert.ok(k.selected&&k.selected.bottom<=k.owner.bottom+1&&k.selected.top>=k.head.bottom-1,'Keyboard option hidden behind header or outside dialog');
  await wheel(page,'.symbol-search-dialog',0,1500,receipt);receipt.symbol.end=await read();
  const end=receipt.symbol.end;if(end.maxScroll>0)assert.ok(end.scrollTop>0);assert.ok(Math.abs(end.head.top-end.clientTop)<=2,'Symbol heading not retained at owner edge');
  await screenshot(page,'symbols-'+receipt.width+'x'+receipt.height,receipt);
  // Shift-Tab reaches the retained close action from the search combobox.
  await key(page,'Shift+Tab',receipt);const focus=await target(page,'.symbol-search-close');
  receipt.symbol.focus=focus;assert.ok(reachable(focus));assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('.symbol-search-close')),true);assert.ok(focus.outlineWidth>=2&&focus.outline!=='none');
  if(phase!=='before'&&receipt.width<=620)assert.ok(focus.width>=44&&focus.height>=44,'Mobile symbol close must be 44px');
  await key(page,'Enter',receipt);assert.equal(await page.locator('.symbol-search-dialog').evaluate(el=>el.open),false);receipt.symbol.closedByKeyboard=true;
}

try{
  await mkdir(output,{recursive:true});
  for(const f of ['dist/styles.css','dist/monthly-backtest.css','dist/symbol-selector.css','dist/atlas-shell.css','dist/monthly-backtest-view.js','dist/cycle-clock-backtest-view.js','dist/symbol-selector.js','dist/chart-navigation.js','apps/web/src/housing.css','tools/hallmark/upstream/sloplint.mjs'])report.sourceHashes[f]=sha(await source(f));
  report.probeHash=sha(await readFile(fileURLToPath(import.meta.url)));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/bitcoin-cycle-atlas/';
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage']});report.browserVersion=browser.version();
  for(const size of [{width:320,height:900},{width:1440,height:900},{width:900,height:430}].filter(size=>!arg('width')||size.width===Number(arg('width')))){
    const receipt={...size,status:'running',inputs:[],ledgers:[],screenshots:[]};report.cases.push(receipt);
    const context=await browser.newContext({viewport:size,hasTouch:size.width===320});
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    const page=await context.newPage();page.on('pageerror',error=>report.runtimeErrors.push({size,error:String(error)}));page.on('requestfailed',request=>report.resourceFailures.push({size,url:request.url(),error:request.failure()?.errorText}));
    try{
      if(!arg('case')||arg('case')==='workbench'){
        await page.goto(base+'?symbol=BTCUSD&granularity=daily&type=line');
        await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.querySelectorAll('#lab-chart path').length>0);
        await symbolCase(page,receipt);
        console.log(JSON.stringify({phase,width:size.width,progress:'symbols'}));
      }
      if(size.height>500&&(!arg('case')||arg('case')==='workbench')){
        await revealToolbar(page,'#workbench-monthly-backtest',receipt);await click(page,'#workbench-monthly-backtest',receipt);
        await waitFor(()=>page.locator('.monthly-backtest:not(.clock-backtest)').evaluate(el=>el.dataset.state==='ready'&&el.querySelectorAll('[data-mb="rows"] tr').length>=10),'complete real monthly origins',120000);
        if(await page.locator('[data-mb="stop"]').isVisible())await click(page,'[data-mb="stop"]',receipt);
        // Starting at the close control, native Tab reaches the summary and ledger regions.
        await click(page,'[data-mb="common"]',receipt);
        let focused=false;for(let step=0;step<20;step++){await key(page,'Tab',receipt);if(await page.evaluate(()=>document.activeElement?.classList.contains('monthly-ledger'))){focused=true;break;}}
        assert.ok(focused,'Tab order never reached monthly native scroll owner');
        const beforeKey=await geometry(page,'.monthly-backtest:not(.clock-backtest) .monthly-ledger');await key(page,'PageDown',receipt);const afterKey=await geometry(page,'.monthly-backtest:not(.clock-backtest) .monthly-ledger');
        assert.ok(afterKey.scrollTop>beforeKey.scrollTop,'PageDown did not scroll focused ledger');receipt.keyboardLedger={before:beforeKey,after:afterKey};
        await screenshot(page,'monthly-keyboard-'+size.width,receipt);
        await ledger(page,'.monthly-backtest:not(.clock-backtest) .monthly-ledger','monthly',receipt);
        console.log(JSON.stringify({phase,width:size.width,progress:'monthly'}));
        await revealToolbar(page,'#workbench-monthly-backtest',receipt);await click(page,'#workbench-monthly-backtest',receipt);await click(page,'[data-mb="clock-mode"]',receipt);
        await waitFor(()=>page.locator('.clock-backtest [data-cb="rows"] tr').count().then(n=>n>=10),'clock rows',120000);
        await ledger(page,'.clock-backtest .clock-ledger','clock',receipt);
        console.log(JSON.stringify({phase,width:size.width,progress:'clock'}));
      }
      if(size.height>500&&(!arg('case')||arg('case')==='contrast'))await contrastCase(page,base,receipt);
      if(size.height>500&&(!arg('case')||arg('case')==='apps'))await embeddedAppCases(page,base,receipt);
      receipt.status=receipt.knownIssues?.length?'issues':'passed';
    }catch(error){receipt.status='failed';receipt.error=String(error.stack||error);await screenshot(page,'failure-'+size.width+'x'+size.height,receipt);throw error;}
    finally{await context.close();}
  }
  report.status=report.cases.some(c=>c.status==='issues')?'issues':'passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  report.servedHashes=Object.fromEntries(served);report.finishedAt=new Date().toISOString();
  report.sourceIntegrity={mode:reference?'immutable Git blobs':'cached working-tree bytes',changed:[]};
  if(!reference)for(const [file,hash]of served){if(sha(await readFile(path.join(root,file)))!==hash)report.sourceIntegrity.changed.push(file);}
  if(report.sourceIntegrity.changed.length){report.status='failed';process.exitCode=1;}
  await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify({phase,status:report.status,cases:report.cases.map(c=>({width:c.width,height:c.height,status:c.status,error:c.error})),error:report.error,output}));
}
