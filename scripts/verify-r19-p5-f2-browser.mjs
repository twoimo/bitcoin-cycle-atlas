#!/usr/bin/env node
// F2 only: native computed paint and screenshots. Never replaces the media or D-1 gates.
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,rm,realpath,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument,verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {p0ParseColor,p0Composite,p0Contrast} from './ui-renewal-p0-contract.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),site=resolve(root,'dist'),prefix='/bitcoin-cycle-atlas/';
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(root,option('--out','build/r19-p5-f2-browser'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const baseline=git('rev-parse','--verify',option('--baseline-ref','3356e68aca3e45ce82bbeca1e852ba220fa9c762')+'^{commit}');
const bin=process.env.ATLAS_BROWSER_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),delay=ms=>new Promise(done=>setTimeout(done,ms));
const specs=['light','dark'].flatMap(theme=>[320,1440].map(width=>({id:`conference-${theme}-${width}`,theme,width,height:900})));
const sourcePaths=['dist/index.html','dist/styles.css','dist/conference/player.css','dist/conference/player.js','dist/conference/media-manifest.json','dist/ui/theme.js'];
async function identity(){return {commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),trackedChanges:git('status','--porcelain','--untracked-files=no'),hashes:Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(resolve(root,path)))])))};}
class Cdp{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.errors=[];ws.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));if(message.method==='Runtime.exceptionThrown')this.errors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
    const call=this.pending.get(message.id);if(!call)return;this.pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(new Error(message.error.message)):call.resolve(message.result||{});
  });}
  static async connect(url){const ws=new WebSocket(url);await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);done();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});return new Cdp(ws);}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();for(const call of this.pending.values()){clearTimeout(call.timer);call.reject(new Error('CDP closed'));}this.pending.clear();}
}
async function evaluate(cdp,fn,...args){const value=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(arg=>JSON.stringify(arg)).join(',')})`,awaitPromise:true,returnByValue:true});if(value.exceptionDetails)throw new Error(JSON.stringify(value.exceptionDetails));return value.result.value;}
async function until(fn,label){const deadline=Date.now()+45000;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message))throw error;}await delay(100);}throw new Error('Timed out: '+label);}
async function settle(cdp){await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});}
function inspect(){
  const button=document.querySelector('.conference-play');if(!button)throw new Error('Missing conference play button');
  const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};};
  const visible=el=>{const b=el.getBoundingClientRect();let shown=el instanceof SVGElement?true:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});for(let node=el;shown&&node;node=node.parentElement){const c=getComputedStyle(node);shown=c.display!=='none'&&c.visibility==='visible'&&Number(c.opacity)>0;}return shown&&b.width>0&&b.height>0&&b.right>0&&b.bottom>0&&b.left<innerWidth&&b.top<innerHeight;};
  const named=el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:el.classList.length?'.'+[...el.classList].join('.'):''),layers=el=>{
    const rows=[];for(let node=el;node;node=node.parentElement){const c=getComputedStyle(node);rows.push({element:named(node),background:c.backgroundColor,opacity:Number(c.opacity),backgroundImage:c.backgroundImage,filter:c.filter,backdropFilter:c.backdropFilter,mixBlendMode:c.mixBlendMode,maskImage:c.maskImage,clipPath:c.clipPath});}return rows;
  };
  const hit=el=>{const b=el.getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;return x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&el.contains(document.elementFromPoint(x,y));};
  const c=getComputedStyle(button),svg=button.querySelector('svg'),paths=[...button.querySelectorAll('svg path')],clock=document.querySelector('.conference-clock'),texts=[];
  if(clock){const walker=document.createTreeWalker(clock,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode())if(node.data.trim()){
    const owner=node.parentElement,range=document.createRange();range.selectNodeContents(node);const boxes=[...range.getClientRects()].map(b=>({x:b.x,y:b.y,width:b.width,height:b.height}));
    const unobscured=boxes.length>0&&boxes.every(b=>b.width>0&&b.height>0&&b.x>=0&&b.y>=0&&b.x+b.width<=innerWidth&&b.y+b.height<=innerHeight&&clock.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)));
    texts.push({text:node.data,color:getComputedStyle(owner).color,visible:visible(owner)&&unobscured,boxes,layers:layers(owner)});
  }}
  const palette=[];for(const el of document.querySelectorAll('body,body *'))if(visible(el)){const color=getComputedStyle(el).backgroundColor;if(!palette.some(row=>row.color===color))palette.push({color,example:named(el)});}
  const neighbor=[...document.querySelectorAll('.conference-transport button:not(:disabled),.conference-player button:not(:disabled)')].find(el=>el!==button&&el.getAttribute('aria-pressed')!=='true'&&visible(el)&&hit(el));
  const focusRules=[];const visit=rules=>{for(const rule of rules){if(rule.cssRules)visit(rule.cssRules);if(rule.selectorText?.includes(':focus-visible')&&rule.style?.outline&&button.matches(rule.selectorText.replace(/:focus-visible/g,'')))focusRules.push({selector:rule.selectorText,outline:rule.style.outline});}};for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}
  return {theme:document.documentElement.dataset.theme,colorScheme:getComputedStyle(document.documentElement).colorScheme,boot:document.documentElement.dataset.boot,state:document.querySelector('.conference-player')?.dataset.state,viewport:{width:innerWidth,height:innerHeight},h1Count:document.querySelectorAll('h1').length,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
    play:{name:button.getAttribute('aria-label'),disabled:button.disabled,hover:button.matches(':hover'),visible:visible(button),centerHit:hit(button),box:rect(button),background:c.backgroundColor,color:c.color,opacity:Number(c.opacity),radii:[c.borderTopLeftRadius,c.borderTopRightRadius,c.borderBottomRightRadius,c.borderBottomLeftRadius],border:{color:c.borderTopColor,width:c.borderTopWidth,style:c.borderTopStyle,layers:layers(button),sides:['Top','Right','Bottom','Left'].map(side=>({side:side.toLowerCase(),color:c['border'+side+'Color'],width:c['border'+side+'Width'],style:c['border'+side+'Style']}))},svg:svg?{hidden:svg.getAttribute('aria-hidden'),focusable:svg.getAttribute('focusable'),box:rect(svg)}:null,
      paths:paths.map(path=>{const p=getComputedStyle(path);return {d:path.getAttribute('d'),color:p.color,stroke:p.stroke,strokeOpacity:Number(p.strokeOpacity),strokeWidth:p.strokeWidth,fill:p.fill,visible:visible(path),layers:layers(path)};})},texts,palette,
    neighbor:neighbor?{name:neighbor.getAttribute('aria-label')||neighbor.textContent,box:rect(neighbor),background:getComputedStyle(neighbor).backgroundColor}:null,focusRules,
    tokens:Object.fromEntries(['--surface','--surface-hover','--text','--muted','--accent','--accent-ink','--focus'].map(name=>[name,c.getPropertyValue(name).trim()]))};
}
function paint(raw,layers,paintOpacity=1){
  let foreground=p0ParseColor(raw),background=[0,0,0,0];if(!Number.isFinite(paintOpacity)||paintOpacity<0||paintOpacity>1)throw new Error('Unknown paint opacity');foreground[3]*=paintOpacity;
  for(const row of layers){
    if(!Number.isFinite(row.opacity)||row.opacity<0||row.opacity>1)throw new Error('Unknown ancestor opacity');
    if(['filter','backdropFilter','maskImage','clipPath'].some(key=>row[key]&&row[key]!=='none')||row.mixBlendMode!=='normal')throw new Error('Unsupported paint effect on '+row.element);
    if(row.backgroundImage!=='none')throw new Error('Unsupported background image on '+row.element);
    const back=p0ParseColor(row.background);foreground=p0Composite(foreground,back);background=p0Composite(background,back);foreground[3]*=row.opacity;background[3]*=row.opacity;
  }
  return {foreground,background,ratio:p0Contrast(foreground,background),method:'Computed sRGB alpha composition through actual ancestor backgrounds and opacity; standard WCAG luminance, not raster anti-aliasing.'};
}
function colorEntry(raw){const rgba=p0ParseColor(raw),[r,g,b]=rgba.slice(0,3).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let hue=null;if(d)hue=((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60)%360;return {raw,rgba,key:rgba.join(','),hue,saturation:d?d/(1-Math.abs(2*l-1)):0,inHueBand:hue!==null&&hue>=200&&hue<=260,oldBlue:rgba[0]===41&&rgba[1]===98&&rgba[2]===255&&rgba[3]>0};}
function measurements(state){
  const icons=state.play.paths.map(path=>({...paint(path.stroke,path.layers,path.strokeOpacity),rawStroke:path.stroke,strokeOpacity:path.strokeOpacity,visible:path.visible,strokeWidth:path.strokeWidth}));
  const text=state.texts.map(item=>({...paint(item.color,item.layers),text:item.text,rawColor:item.color,visible:item.visible}));
  const border=paint(state.play.border.color,state.play.border.layers);
  return {icons,text,border:{...border,meets3: border.ratio>=3,acceptance:state.play.disabled?'Recorded disabled boundary; not substituted for icon contrast.':'Enabled boundary measured separately.'},background:colorEntry(state.play.background)};
}
function tokenContract(state,mode){
  const checks=[],colors={};try{
    for(const name of ['--surface','--surface-hover','--text','--accent-ink']){try{colors[name]=p0ParseColor(state.tokens?.[name]);}catch(error){throw new Error(name+' is unverified: '+error.message);}}
    const compare=(property,actual,token)=>{const color=p0ParseColor(actual),expected=colors[token];checks.push({property,actual,token,expected:state.tokens[token],passed:color.every((value,index)=>value===expected[index])});};
    compare('background-color',state.play.background,mode==='hover'?'--surface-hover':'--surface');compare('color',state.play.color,'--text');
    if(!state.play.paths.length)throw new Error('No SVG paths to verify');
    for(const [index,path] of state.play.paths.entries()){compare(`svg path ${index} color`,path.color,'--text');compare(`svg path ${index} stroke`,path.stroke,'--text');}
    if(state.play.border.sides?.length!==4)throw new Error('Four computed border sides unavailable');
    for(const side of state.play.border.sides){compare(`border-${side.side}-color`,side.color,'--accent-ink');checks.push({property:`border-${side.side}-width/style`,actual:{width:side.width,style:side.style},expected:'positive px width and a visible border style',passed:/^(?:\d+(?:\.\d+)?|\.\d+)px$/.test(side.width)&&Number.parseFloat(side.width)>0&&['solid','double','dotted','dashed','groove','ridge','inset','outset'].includes(side.style)});}
    const errors=checks.filter(check=>!check.passed).map(check=>check.property+' does not satisfy '+(check.token||check.expected));return {status:errors.length?'failed':'passed',mode,checks,errors};
  }catch(error){return {status:'unverified',mode,checks,errors:[error.message]};}
}
async function hover(cdp,box){
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x+box.width/2,y:box.y+box.height/2});await settle(cdp);
  await evaluate(cdp,async box=>{
    const button=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('button');if(!button)throw new Error('Native hover target missing');
    const animations=button.getAnimations({subtree:true});if(animations.some(animation=>animation.effect?.getComputedTiming().iterations===Infinity))throw new Error('Hover paint has an indefinite animation');
    await Promise.all(animations.map(animation=>animation.finished));
  },box);await settle(cdp);
}
async function screenshot(cdp,file,spec){const png=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64');if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==spec.width||png.readUInt32BE(20)!==spec.height)throw new Error('Invalid PNG or capture dimensions');await writeFile(resolve(out,file),png);return {file,sha256:sha(png),bytes:png.length,width:spec.width,height:spec.height};}

await mkdir(out,{recursive:true});
const report={kind:'r19-p5-f2-native-paint',startedAt:new Date().toISOString(),baseline,scope:'Conference play default paint, native enabled hover when available, adjacent visible clock text, and 320/1440 screenshots in both themes. No media, playback, D-1, timing, chart-axis, or full P5 qualification.',
  thresholds:{text:4.5,icon:3,allowedRadiusPx:[3,6],targetPx:56},requiredTokens:{normalBackground:'--surface',hoverBackground:'--surface-hover',icon:'--text',border:'--accent-ink'},colorPolicy:'The candidate must match its exact native surface/text/accent-ring token contract. Separately record every raw hue, including low-saturation neutrals. A hue-200–260 background is new only if absent from the same-theme baseline visible UI/observed native hover palette; existing neutrals are not new accents.',
  harnessSha256:sha(await readFile(fileURLToPath(import.meta.url))),sourceBefore:await identity(),lanes:[],failures:[]};
let chrome,browser,profile,stderr='',launchError,server,cdp;
try{
  profile=await mkdtemp(resolve(tmpdir(),'atlas-f2-'));const flags=['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];if(process.platform==='linux'&&process.getuid?.()===0)flags.unshift('--no-sandbox');
  chrome=spawn(bin,flags,{stdio:['ignore','ignore','pipe']});chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-6000);});chrome.once('error',error=>{launchError=error;});
  const port=await until(async()=>{if(launchError)throw launchError;try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{if(chrome.exitCode!==null||chrome.signalCode)throw new Error(`Chrome exited (${chrome.exitCode??chrome.signalCode}): ${stderr}`);return null;}},'Chrome debugging port');
  browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.browser=await browser.send('Browser.getVersion');
  for(const laneSpec of [{name:'before',ref:baseline},{name:'after',ref:null}]){
    const lane={...laneSpec,cases:[],servedFiles:{},sourceStable:null};report.lanes.push(lane);const cache=new Map();
    const load=async file=>lane.ref?(cache.has(file)?cache.get(file):cache.set(file,execFileSync('git',['show',`${lane.ref}:dist/${file}`],{cwd:root,maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']})).get(file)):readFile(resolve(site,file));
    const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
    server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith(prefix))throw new Error('route');let file=pathname.slice(prefix.length);if(!file||file.endsWith('/'))file+='index.html';const full=resolve(site,file);if(!full.startsWith(site+sep))throw new Error('scope');if(!lane.ref){if((await stat(full)).isDirectory())file+='/index.html';if(!(await realpath(resolve(site,file))).startsWith(site+sep))throw new Error('scope');}const bytes=await load(file),hash=sha(bytes);if(lane.servedFiles[file]&&lane.servedFiles[file]!==hash)throw new Error('source changed during requests');lane.servedFiles[file]=hash;res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('not found');}});
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});const base=`http://127.0.0.1:${server.address().port}${prefix}`;await mkdir(resolve(out,lane.name),{recursive:true});
    for(const spec of specs){const result={...spec,status:'failed',failures:[]};lane.cases.push(result);let contextId;
      try{
        ({browserContextId:contextId}=await browser.send('Target.createBrowserContext'));const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:contextId});const targets=await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();cdp=await Cdp.connect(targets.find(target=>target.id===targetId).webSocketDebuggerUrl);
        await cdp.send('Page.enable');await cdp.send('Runtime.enable');result.nativeWindowEnvelope=await verifyHeadlessWindowEnvelope(cdp,spec);await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width<=620});await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:spec.theme}]});
        await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.setItem('atlas-ui-theme',${JSON.stringify(spec.theme)})}catch{}`});await cdp.send('Page.navigate',{url:base+'?page=conference'});
        await until(()=>evaluate(cdp,theme=>{if(document.documentElement.dataset.boot==='error')throw new Error('Product boot error');return document.documentElement.dataset.boot==='ready'&&document.body.dataset.page==='conference'&&document.documentElement.dataset.theme===theme&&Boolean(document.querySelector('.conference-player[data-state="ready"]'));},spec.theme),spec.id+' product ready');await settle(cdp);
        result.state=await evaluate(cdp,inspect);result.screenshot=await screenshot(cdp,`${lane.name}/${spec.id}.png`,spec);result.measured=measurements(result.state);
        result.palette=result.state.palette.map(row=>({...colorEntry(row.color),example:row.example}));
        if(result.state.neighbor){await hover(cdp,result.state.neighbor.box);result.neighborHover=await evaluate(cdp,box=>{const element=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('button');return element?{name:element.getAttribute('aria-label')||element.textContent,disabled:element.disabled,hover:element.matches(':hover'),background:getComputedStyle(element).backgroundColor}:null;},result.state.neighbor.box);if(!result.neighborHover||result.neighborHover.disabled||!result.neighborHover.hover)throw new Error('Neighbor native hover unverified');result.palette.push({...colorEntry(result.neighborHover.background),example:'native hover: '+result.neighborHover.name});}
        result.playHover={status:'unobserved',reason:'Button is disabled; no enabled state was fabricated.'};
        if(!result.state.play.disabled){await hover(cdp,result.state.play.box);const hovered=await evaluate(cdp,inspect);if(!hovered.play.hover||hovered.play.disabled)throw new Error('Play native hover unverified');result.playHover={status:'observed',state:hovered.play,tokens:hovered.tokens,measured:measurements(hovered),tokenContract:tokenContract(hovered,'hover')};}
        result.focus={rendered:'unobserved',reason:result.state.play.disabled?'Disabled button cannot receive keyboard focus.':'This paint capture does not exercise keyboard focus.',declared2px:result.state.focusRules.some(rule=>/^2px solid /.test(rule.outline))};
        const s=result.state,m=result.measured;if(s.viewport.width!==spec.width||s.viewport.height!==spec.height)result.failures.push('Viewport mismatch');if(s.theme!==spec.theme||s.colorScheme!==spec.theme)result.failures.push('Actual color scheme mismatch');if(s.h1Count!==1)result.failures.push('h1 count must be 1');if(s.overflow!==0)result.failures.push('Horizontal overflow must be 0');
        if(!s.play.visible||!s.play.centerHit||s.play.box.width!==56||s.play.box.height!==56)result.failures.push('Visible 56px play hit box unverified');if(!['재생','일시정지'].includes(s.play.name)||!s.play.svg||s.play.svg.hidden!=='true'||s.play.svg.focusable!=='false')result.failures.push('Accessible play name/decorative SVG unverified');
        if(!m.icons.length||m.icons.some(item=>!item.visible||!(parseFloat(item.strokeWidth)>0)))result.failures.push('Visible SVG stroke unverified');if(!m.text.length||m.text.some(item=>!item.visible||!item.text.trim()))result.failures.push('Visible clock text unverified');
        if(!lane.ref){
          result.tokenContract={normal:tokenContract(s,'normal'),hover:result.playHover.tokenContract||{status:'unobserved',reason:result.playHover.reason}};
          for(const [mode,contract] of Object.entries(result.tokenContract))if(mode==='normal'||result.playHover.status==='observed'){if(contract.status!=='passed')result.failures.push(`Candidate ${mode} token contract ${contract.status}: ${contract.errors?.join('; ')||'unverified'}`);}
          if(s.play.radii.some(value=>!['3px','6px'].includes(value)))result.failures.push('Play radius must be 3px or 6px');if(!result.focus.declared2px)result.failures.push('Existing 2px focus declaration missing');
          for(const measured of [m,...(result.playHover.status==='observed'?[result.playHover.measured]:[])]){if(measured.icons.some(item=>item.ratio<3||!item.visible))result.failures.push('Icon contrast below 3:1 or unobserved');if(measured.text.some(item=>item.ratio<4.5||!item.visible))result.failures.push('Clock text contrast below 4.5:1 or unobserved');if(!s.play.disabled&&measured.border.ratio<3)result.failures.push('Enabled boundary contrast below 3:1');}
          const previous=report.lanes.find(item=>item.name==='before').cases.find(item=>item.id===spec.id);if(!previous?.palette||previous.status!=='passed')throw new Error('Comparable baseline palette unverified');
          const known=new Set(previous.palette.map(item=>item.key)),backgrounds=[m.background,...(result.playHover.status==='observed'?[result.playHover.measured.background]:[])];
          result.backgroundAcceptance={observedStates:backgrounds.length,rawHueBandOccurrences:backgrounds.filter(item=>item.inHueBand).length,newHueBandColors:backgrounds.filter(item=>item.inHueBand&&!known.has(item.key)),oldBlueOccurrences:backgrounds.filter(item=>item.oldBlue).length,reusedBaselineColors:backgrounds.filter(item=>known.has(item.key))};
          if(result.backgroundAcceptance.newHueBandColors.length||result.backgroundAcceptance.oldBlueOccurrences)result.failures.push('Forbidden new hue-band or legacy-blue play background');
        }
        result.failures.push(...cdp.errors.map(error=>'runtime: '+error));result.status=result.failures.length?'failed':'passed';
      }catch(error){result.failures.push(error.stack||String(error));}
      finally{cdp?.close();cdp=null;if(contextId)await browser.send('Target.disposeBrowserContext',{browserContextId:contextId}).catch(()=>{});}
      report.failures.push(...result.failures.map(message=>`${lane.name}/${spec.id}: ${message}`));console.log(JSON.stringify({lane:lane.name,id:spec.id,status:result.status,background:result.state?.play.background,radius:result.state?.play.radii,iconContrast:result.measured?.icons.map(item=>item.ratio),textContrast:result.measured?.text.map(item=>item.ratio),screenshot:result.screenshot?.file}));
    }
    lane.sourceStable=lane.ref?true:(await Promise.all(Object.entries(lane.servedFiles).map(async([file,hash])=>sha(await readFile(resolve(site,file)))===hash))).every(Boolean);if(!lane.sourceStable)report.failures.push(lane.name+': served source changed');await new Promise(done=>server.close(done));server=null;
  }
}catch(error){report.failures.push('harness: '+(error.stack||String(error)));}
finally{
  cdp?.close();browser?.close();chrome?.kill('SIGKILL');if(server)await new Promise(done=>server.close(done));if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
  report.sourceAfter=await identity();report.workingTreeStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.sourceStable=report.workingTreeStable&&report.lanes.length===2&&report.lanes.every(lane=>lane.sourceStable===true);
  const after=report.lanes.find(lane=>lane.name==='after');report.completedCases=after?.cases.filter(item=>item.state&&item.measured&&item.screenshot).length||0;report.complete=report.completedCases===specs.length&&report.lanes[0]?.cases.length===specs.length&&report.lanes[0].cases.every(item=>item.state&&item.measured&&item.screenshot);
  const accepted=report.complete&&after.cases.every(item=>item.backgroundAcceptance);report.oldBlueBackgrounds=accepted?after.cases.reduce((sum,item)=>sum+item.backgroundAcceptance.oldBlueOccurrences,0):null;report.newHueBandBackgrounds=accepted?after.cases.reduce((sum,item)=>sum+item.backgroundAcceptance.newHueBandColors.length,0):null;
  report.status=report.complete&&report.sourceStable&&report.failures.length===0?'passed':report.completedCases?'failed':'blocked';report.qualifiesF2ObservedPaint=report.status==='passed';report.mediaPlaybackVerified=false;report.fullP5Qualified=false;report.finishedAt=new Date().toISOString();report.chromeStderr=stderr;
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,complete:report.complete,completedCases:report.completedCases,sourceStable:report.sourceStable,oldBlueBackgrounds:report.oldBlueBackgrounds,newHueBandBackgrounds:report.newHueBandBackgrounds,failures:report.failures.length,out}));if(report.status!=='passed')process.exitCode=1;
}
