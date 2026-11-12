#!/usr/bin/env node
// R19 P0 only. Own static origin, Chromium profile and append-only evidence.
// Never changes product styling, manufactures a loaded font, or qualifies the
// independent R17/A9/data gates. No browser or dependency is installed here.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {constants} from 'node:fs';
import {access,mkdir,mkdtemp,readFile,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,extname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SITE_STYLE_SOURCES} from './build-site-styles.mjs';
import {ensureOwnedVisibleForPaint} from './browser-paint-readiness.mjs';
import {headlessWindowArgument,verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {verifyP0TextInk} from './ui-renewal-p0-text-hit.mjs';
import {
  inspectP0CssSources,inspectP0TokenPairs,p0Cases,p0FinalStatus,p0FontCss,p0FontFamily,p0PaintSamples,
  p0SampleCoverage,p0ThemeStorageKey,p0TokenPairs,validateP0FontEvidence,validateP0Paint,validateP0PaintRole,validateP0Typography,
} from './ui-renewal-p0-contract.mjs';

const root = fileURLToPath(new URL('..',import.meta.url)), site = resolve(root,'dist'), prefix = '/bitcoin-cycle-atlas';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

export function parseP0Arguments(argv,cwd=root) {
  const settings = {out:null,bin:process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium'),sourceOnly:false};
  for (let i = 0; i<argv.length; i++) {
    if (argv[i] === '--help') {settings.help = true;continue;}
    if (argv[i] === '--source-only') {settings.sourceOnly = true;continue;}
    if (!['--out','--browser'].includes(argv[i]) || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    const name = argv[i] === '--out' ? 'out' : 'bin';settings[name] = resolve(cwd,argv[++i]);
  }
  if (!settings.help && !settings.out) throw new Error('--out NEW_DIRECTORY is required');
  return settings;
}

/** Source inventory is bounded and explicit. JS hex colours are disclosed as
 * residual declarations, not mislabelled as eliminated by CSS tokenisation. */
export async function readP0Sources(projectRoot=root) {
  const appCss = execFileSync('git',['ls-files','--','apps/web/src/*.css'],{cwd:projectRoot,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  const cssFiles = [...SITE_STYLE_SOURCES.filter(file => !file.startsWith('vendor/')).map(file => `dist/${file}`),...appCss];
  const html = await readFile(resolve(projectRoot,'dist/index.html'),'utf8');
  const sources = await Promise.all(cssFiles.map(async file => ({file,source:await readFile(resolve(projectRoot,file),'utf8')})));
  for (const file of ['dist/index.html','apps/web/index.html']) {
    const source = file === 'dist/index.html' ? html : await readFile(resolve(projectRoot,file),'utf8');
    for (const [index,match] of [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].entries()) sources.push({file:`${file}#inline-style-${index}`,source:match[1]});
  }
  const audit = inspectP0CssSources(sources), pairs = inspectP0TokenPairs(audit.tokens), fontManifestFile = 'dist/fonts/pretendard/PROVENANCE.json';
  const manifest = JSON.parse(await readFile(resolve(projectRoot,fontManifestFile),'utf8')), fontBase = dirname(fontManifestFile), fontIssues = [];
  const fontFiles = [manifest.stylesheet,manifest.license,...manifest.fontAssets.files].map(item => ({...item,file:`${fontBase}/${item.file}`}));
  for (const entry of fontFiles) {
    const bytes = await readFile(resolve(projectRoot,entry.file));
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) fontIssues.push(`font provenance mismatch: ${entry.file}`);
    if (entry.file.endsWith('.woff2') && bytes.subarray(0,4).toString() !== 'wOF2') fontIssues.push(`invalid WOFF2 header: ${entry.file}`);
  }
  const fontCss = await readFile(resolve(projectRoot,p0FontCss),'utf8');
  if (manifest.fontAssets.files.length !== 92 || [...fontCss.matchAll(/@font-face\s*\{/g)].length !== 92) fontIssues.push('expected the 92 pinned unicode-range font faces');
  const optional = html.match(/<link\b[^>]*id="atlas-optional-fonts"[^>]*>/)?.[0] || '';
  if (!optional.includes('fonts/pretendard/pretendard-variable.css') || !optional.includes('media="print"') || /href="https?:/.test(optional)) fontIssues.push('optional font CSS is not the local nonblocking stylesheet');
  const jsFiles = execFileSync('git',['ls-files','--','dist/*.js'],{cwd:projectRoot,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  if (!jsFiles.includes('dist/ui/theme.js')) jsFiles.push('dist/ui/theme.js');
  const residualJsColors = [];
  for (const file of jsFiles) {
    const source = await readFile(resolve(projectRoot,file),'utf8'), literals = [...source.matchAll(/#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{4}\b|#[\da-f]{3}\b/gi)];
    if (literals.length) residualJsColors.push({file,count:literals.length,values:[...new Set(literals.map(match => match[0]))],
      disposition:'existing JS/SVG/data/brand literal inventory; CSS consolidation does not prove zero literals in this file'});
  }
  const files = [...new Set([...cssFiles,'dist/vendor/skullet/styles.css','dist/site-before-shell.css','dist/site-after-shell.css','dist/index.html','apps/web/index.html',
    ...jsFiles,fontManifestFile,...fontFiles.map(entry => entry.file),'dist/data/btc-daily.json','dist/data/eth-ohlc.json',
    'scripts/ui-renewal-p0-contract.mjs','scripts/verify-ui-renewal-p0-browser.mjs','scripts/ui-renewal-p0-text-hit.mjs','scripts/build-site-styles.mjs',
    'scripts/browser-paint-readiness.mjs','scripts/headless-browser-window.mjs'])].sort();
  const hashes = Object.fromEntries(await Promise.all(files.map(async file => [file,sha256(await readFile(resolve(projectRoot,file)))])));
  return {audit:{...audit,tokens:Object.fromEntries(audit.tokens)},tokenPairs:pairs,hashes,
    fonts:{manifest:fontManifestFile,family:manifest.family,faces:manifest.fontAssets.count,bytes:manifest.fontAssets.totalBytes,issues:fontIssues,status:fontIssues.length ? 'failed' : 'passed'},
    residualJsColors,excludedThirdParty:['dist/vendor/skullet/styles.css'],scopeFiles:cssFiles};
}

class Cdp {
  constructor(ws) {
    this.ws = ws;this.id = 0;this.pending = new Map();this.listeners = new Map();this.eventErrors = [];
    ws.addEventListener('message',event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {const listener = this.listeners.get(message.method);if (listener) Promise.resolve().then(() => listener(message.params || {})).catch(error => this.eventErrors.push(error.stack || String(error)));return;}
      const call = this.pending.get(message.id);if (!call) return;
      this.pending.delete(message.id);clearTimeout(call.timer);message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result || {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);await new Promise((resolve,reject) => {const timer = setTimeout(() => reject(new Error('CDP connection timeout')),15000);
      ws.addEventListener('open',() => {clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',() => {clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});
    return new Cdp(ws);
  }
  send(method,params={}) {const id = ++this.id;return new Promise((resolve,reject) => {const timer = setTimeout(() => {this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},30000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close() {for (const call of this.pending.values()) {clearTimeout(call.timer);call.reject(new Error('CDP target closed'));}this.pending.clear();this.ws.close();}
}
export function p0EvaluationExpression(fn,args=[]) {return `(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`;}
async function evaluate(cdp,fn,...args) {
  const result = await cdp.send('Runtime.evaluate',{expression:p0EvaluationExpression(fn,args),awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw new Error(`Browser evaluation: ${JSON.stringify(result.exceptionDetails).slice(0,1600)}`);return result.result.value;
}
async function until(fn,label,timeout=45000) {const end = Date.now()+timeout;while (Date.now()<end) {try {const value = await fn();if (value) return value;} catch (error) {if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) throw error;}await delay(100);}throw new Error(`Timed out: ${label}`);}

/** Serialized read-only collector. Native geometry is only claimed when this
 * function really ran inside Chromium, never when exercised in a unit model. */
export function inspectP0Page(spec,stage,sampleSpecs,tokenNames) {
  const root = document.documentElement;
  const box = node => {const r = node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const nodePath = node => {
    const parts = [];
    for (let current = node;current && parts.length<5;current = current.parentElement) {
      if (current.id) {parts.unshift(`#${current.id}`);break;}
      const index = current.parentElement ? [...current.parentElement.children].indexOf(current)+1 : 1;
      parts.unshift(current.tagName.toLowerCase()+`:nth-child(${index})`);
    }
    return parts.join(' > ');
  };
  const visible = node => {
    if (!node || !node.getClientRects().length || node.closest('[hidden]')) return false;
    const r = box(node);if (!(r.width>0 && r.height>0 && r.right>0 && r.left<innerWidth && r.bottom>0 && r.top<innerHeight)) return false;
    let clipped = {left:Math.max(0,r.left),right:Math.min(innerWidth,r.right),top:Math.max(0,r.top),bottom:Math.min(innerHeight,r.bottom)};
    for (let current = node;current;current = current.parentElement) {
      const s = getComputedStyle(current);if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0 || /rect\(0px[, ]+0px[, ]+0px[, ]+0px\)/.test(s.clip) || /inset\(50%\)/.test(s.clipPath)) return false;
      if (current !== node && (/^(?:auto|scroll|hidden|clip)$/.test(s.overflowX+'') || /^(?:auto|scroll|hidden|clip)$/.test(s.overflowY+''))) {
        const a = box(current), left = a.left+(current.clientLeft || 0), top = a.top+(current.clientTop || 0);
        if (/^(?:auto|scroll|hidden|clip)$/.test(s.overflowX)) {clipped.left = Math.max(clipped.left,left);clipped.right = Math.min(clipped.right,left+current.clientWidth);}
        if (/^(?:auto|scroll|hidden|clip)$/.test(s.overflowY)) {clipped.top = Math.max(clipped.top,top);clipped.bottom = Math.min(clipped.bottom,top+current.clientHeight);}
      }
    }
    const x = r.left+r.width/2, y = r.top+r.height/2;
    return clipped.right>clipped.left && clipped.bottom>clipped.top && x>=clipped.left && x<=clipped.right && y>=clipped.top && y<=clipped.bottom;
  };
  const styleEvidence = (node,kind) => {
    const style = getComputedStyle(node), issues = [], backgrounds = [];
    for (let current = node;current;current = current.parentElement) {
      const value = getComputedStyle(current);backgrounds.push(value.backgroundColor);
      if (value.backgroundImage !== 'none') issues.push(`${nodePath(current)} background image is not a proven solid colour`);
      if (Number(value.opacity) !== 1) issues.push(`${nodePath(current)} group opacity requires separate compositing evidence`);
      if (value.filter !== 'none' || value.mixBlendMode !== 'normal') issues.push(`${nodePath(current)} filter/blend is unsupported`);
      if (value.clipPath !== 'none' || (value.maskImage && value.maskImage !== 'none')) issues.push(`${nodePath(current)} clipped/masked paint needs separate evidence`);
    }
    let foreground = style.webkitTextFillColor || style.color;
    if (kind === 'icon') {
      const stroke = style.stroke !== 'none';foreground = stroke ? style.stroke : style.fill;
      if (foreground === 'none') issues.push('icon has no solid stroke/fill');
      if (Number(stroke ? style.strokeOpacity : style.fillOpacity) !== 1) issues.push('icon stroke/fill opacity requires separate compositing evidence');
    } else if (style.textShadow !== 'none' || style.backgroundClip === 'text') issues.push('text shadow/clipped background needs separate paint evidence');
    return {foreground,backgrounds,issues,fontSize:Number.parseFloat(style.fontSize),fontFamily:style.fontFamily};
  };
  const samples = sampleSpecs.filter(sample => sample.stage === stage && (!sample.symbol || sample.symbol === spec.symbol)).map(sample => {
    const nodes = [...document.querySelectorAll(sample.selector)], node = nodes.find(visible);
    if (!node) return {...sample,visible:false,reason:nodes.length ? 'fixed element is outside visible paint' : 'fixed element is absent'};
    const r = box(node), owner = node.closest('button,a,select,label') || node, x = Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)), y = Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));
    const hit = document.elementFromPoint(x,y), paint = styleEvidence(node,sample.kind);
    // The described H1 inherits pointer-events:none and its block is wider
    // than its text. Keep the empty-box hit as a diagnostic; only the native
    // text-owner proof below can satisfy this fixed sample's visibility gate.
    if (sample.id === 'page-heading' && sample.kind === 'text') paint.issues.push('native heading text ink hit evidence pending');
    else if (!hit || !(node === hit || node.contains(hit) || owner === hit || owner.contains(hit))) paint.issues.push('native sample centre is covered by another element');
    return {...sample,visible:true,rect:r,actualSelector:nodePath(node),text:node.textContent.trim().slice(0,240),nativeHit:hit ? nodePath(hit) : null,...paint};
  });
  const typography = node => ({selector:nodePath(node),visible:visible(node),fontSize:Number.parseFloat(getComputedStyle(node).fontSize),fontFamily:getComputedStyle(node).fontFamily,text:node.textContent.trim().slice(0,160)});
  const proseSelectors = '#chart-reader-body > p,.atlas-settings-body > p,.price-axis-options > .price-axis-basis,.research-article p,.method-card p,.reading-card p,.editorial-panel > p';
  const prose = [...document.querySelectorAll(proseSelectors)].filter(visible).map(typography);
  const denseText = [...document.querySelectorAll('.atlas-canvas-heading button,.atlas-canvas-heading select,.workbench-bottom-bar button,.chart-readout,[data-price-axis-label="tick"],.atlas-page-intro h1')].filter(visible).map(typography);
  const colours = new Map();
  for (const node of document.querySelectorAll('body *')) {
    if (!visible(node)) continue;const style = getComputedStyle(node);
    for (const property of ['color','backgroundColor','borderTopColor','fill','stroke']) {
      const value = style[property];if (!value || value === 'none' || value === 'rgba(0, 0, 0, 0)') continue;
      const key = property+':'+value, entry = colours.get(key) || {property,value,count:0,examples:[]};entry.count++;
      if (entry.examples.length<4) entry.examples.push(nodePath(node));colours.set(key,entry);
    }
  }
  const fontNode = document.querySelector('[data-atlas-theme-toggle]'), fontPaint = fontNode && visible(fontNode) ? styleEvidence(fontNode,'text') : null;
  const range = document.createRange();if (fontNode) range.selectNodeContents(fontNode);const inkRects = fontNode ? [...range.getClientRects()].map(r => ({left:r.left,top:r.top,width:r.width,height:r.height})) : [];
  const overflow = Math.max(0,root.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth);
  return {stage,url:location.href,symbol:root.dataset.symbol,theme:root.dataset.theme,colorScheme:getComputedStyle(root).colorScheme,
    storage:localStorage.getItem('atlas-ui-theme'),viewport:{width:innerWidth,height:innerHeight},overflow,body:typography(document.body),prose,denseText,samples,
    computedColours:[...colours.values()],rootTokens:Object.fromEntries(tokenNames.map(name => [name,getComputedStyle(root).getPropertyValue(name).trim()])),
    font:{selector:'[data-atlas-theme-toggle]',text:fontNode?.textContent || '',visible:Boolean(fontNode && visible(fontNode)),declaredFamily:fontNode ? getComputedStyle(fontNode).fontFamily : '',
      visibleInk:Boolean(fontPaint && inkRects.some(r => r.width>0 && r.height>0) && !fontPaint.issues.length),inkRects,overflow,
      faces:[...document.fonts].map(face => ({family:face.family,status:face.status,weight:face.weight})),status:document.fonts.status},
    themeControl:fontNode ? {pressed:fontNode.getAttribute('aria-pressed'),label:fontNode.getAttribute('aria-label')} : null};
}

/** A geometry-only collector is deliberately insufficient for the H1. The
 * CDP proof honours paint order while including pointer-events:none nodes,
 * and must finish before contrast/coverage can accept the heading sample. */
export async function inspectP0Snapshot(cdp,spec,stage,sampleSpecs,tokenNames) {
  const snapshot = await evaluate(cdp,inspectP0Page,spec,stage,sampleSpecs,tokenNames);
  for (const sample of snapshot.samples) {
    if (sample.id !== 'page-heading' || sample.kind !== 'text') continue;
    if (!sample.visible) {sample.nativeTextHit = {status:'failed',reason:sample.reason || 'heading has no visible text geometry'};continue;}
    try {sample.nativeTextHit = await verifyP0TextInk(cdp,sample.actualSelector);}
    catch (error) {sample.nativeTextHit = {status:'unverified',reason:`native text ink evidence error: ${error.message}`};}
    const proof = sample.nativeTextHit;
    // A layout or text change between the two read-only observations is not
    // success at an old location. Keep the raw coordinates in both receipts.
    if (proof.status === 'passed' && (proof.geometry?.text?.trim() !== sample.text ||
      ['left','top','right','bottom'].some(key => proof.geometry?.rect?.[key] !== sample.rect[key]))) {
      proof.status = 'unverified';proof.reason = 'heading text/geometry changed during native hit verification';
    }
    sample.issues = sample.issues.filter(issue => issue !== 'native heading text ink hit evidence pending');
    if (proof.status !== 'passed') sample.issues.push(`native heading text ink ${proof.status}: ${proof.reason || 'complete native hit evidence is missing'}`);
  }
  return snapshot;
}

/** Read the existing reader's scroll port and a native wheel target. An
 * overflow:hidden container is not relabelled as user-scrollable. */
export function readP0ReaderScroll() {
  const body = document.querySelector('#chart-reader-body');if (!body) return {available:false,reason:'settings reader body is absent'};
  const style = getComputedStyle(body), r = body.getBoundingClientRect();
  const bounds = {left:Math.max(0,r.left+body.clientLeft),right:Math.min(innerWidth,r.left+body.clientLeft+body.clientWidth),
    top:Math.max(0,r.top+body.clientTop),bottom:Math.min(innerHeight,r.top+body.clientTop+body.clientHeight)};
  const x = bounds.right-4, y = (bounds.top+bounds.bottom)/2, hit = document.elementFromPoint(x,y);
  const exposed = bounds.right>bounds.left+8 && bounds.bottom>bounds.top && (hit === body || body.contains(hit));
  return {available:true,overflowY:style.overflowY,scrollTop:body.scrollTop,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,
    maximum:Math.max(0,body.scrollHeight-body.clientHeight),scrollable:/^(?:auto|scroll)$/.test(style.overflowY) && body.scrollHeight>body.clientHeight,
    bounds,point:exposed ? {x,y} : null,hit:hit ? {tag:hit.tagName,id:hit.id || null} : null};
}

/** Native-input orchestration seam, also exercised by deterministic unit
 * models. Every viewport observation is retained, including failing colours.
 * Scrolling exposes the original elements; no scrollTop or style is written. */
export async function collectP0Settings({spec,readSnapshot,readScroll,wheel,settle,capture,maxSteps=24}) {
  const required = p0PaintSamples.filter(sample => sample.stage === 'settings' && (!sample.symbol || sample.symbol === spec.symbol)).map(sample => sample.id);
  const observed = new Set(), snapshots = [], screenshots = [], scrolls = [];let stopReason = null;
  for (let step = 0; step<=maxSteps; step++) {
    const snapshot = await readSnapshot();snapshot.captureId = `settings-${step}`;snapshots.push(snapshot);
    screenshots.push(await capture(snapshot.captureId));
    for (const sample of snapshot.samples || []) if (sample.visible) observed.add(sample.id);
    if (required.every(id => observed.has(id)) && snapshot.font?.visible) {stopReason = 'all fixed settings elements and current font control observed';break;}
    if (step === maxSteps) {stopReason = 'bounded native reader scan exhausted';break;}
    const before = await readScroll();
    if (!before.available || !before.scrollable || !before.point || before.scrollTop>=before.maximum) {stopReason = 'reader has no further exposed native scroll path';scrolls.push({before,dispatched:false});break;}
    const gesture = {...before.point,deltaX:0,deltaY:Math.max(60,Math.min(480,before.clientHeight*.6))};
    await wheel(gesture);await settle();const after = await readScroll();scrolls.push({before,gesture,after,dispatched:true});
    if (!(after.scrollTop>before.scrollTop)) {stopReason = 'native reader wheel did not advance scrollTop';break;}
  }
  return {snapshots,screenshots,scrolls,missingIds:required.filter(id => !observed.has(id)),stopReason};
}

async function settle(cdp) {
  await ensureOwnedVisibleForPaint(cdp,evaluate,until);
  await until(() => evaluate(cdp,() => document.querySelector('#atlas-optional-fonts')?.media === 'all'),'local optional font stylesheet activation');
  await evaluate(cdp,async () => {await document.fonts.ready;await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
}
async function click(cdp,selector) {
  const target = await evaluate(cdp,selector => {
    const nodes = [...document.querySelectorAll(selector)];
    for (const node of nodes) {
      if (node.disabled || node.hidden || !node.getClientRects().length) continue;const r = node.getBoundingClientRect();
      if (!(r.width>0 && r.height>0 && r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight)) continue;
      const x = r.left+r.width/2, y = r.top+r.height/2, hit = document.elementFromPoint(x,y);
      if (node === hit || node.contains(hit)) return {x,y};
    }
    return null;
  },selector);
  if (!target) throw new Error(`Native click target is not exposed: ${selector}`);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});
}
async function openSettings(cdp) {
  const disclosed = await evaluate(cdp,() => {const b = document.querySelector('#atlas-display-options');return Boolean(b && b.getClientRects().length && !b.closest('[hidden]'));});
  if (!disclosed) await click(cdp,'#atlas-shell-features-toggle');
  await click(cdp,'#atlas-display-options');
  await until(() => evaluate(cdp,() => {const b = document.querySelector('[data-atlas-theme-toggle]');return Boolean(b && document.querySelector('#chart-reader')?.hidden === false && !b.closest('[hidden]'));}),'settings reader mounts the original theme control');
}
async function closeSettings(cdp) {await click(cdp,'.reader-heading button');await until(() => evaluate(cdp,() => document.querySelector('#chart-reader')?.hidden),'settings reader closes');}
async function observedReady(cdp,symbol) {
  await until(() => evaluate(cdp,symbol => {if (document.documentElement.dataset.boot === 'error') throw new Error('product boot error');const chart = document.querySelector(symbol === 'BTCUSD' ? '#lab-chart' : '#eth-chart');
    return document.documentElement.dataset.boot === 'ready' && document.documentElement.dataset.symbol === symbol && chart?.querySelector('[data-price-axis-label="tick"]') && Number(chart.dataset.visiblePointCount)>0;},symbol),`${symbol} actual observed chart`);
  await settle(cdp);
}
async function screenshot(cdp,out,file) {const result = await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}), bytes = Buffer.from(result.data,'base64');await writeFile(resolve(out,file),bytes);return {file,bytes:bytes.length,sha256:sha256(bytes)};}

export async function verifyUiRenewalP0Browser(argv=process.argv.slice(2)) {
  const report = {schemaVersion:1,kind:'atlas-ui-renewal-p0',recordedAt:new Date().toISOString(),status:'unverified',qualifiesP0Verification:false,qualifiesFullVerification:false,
    methodology:{source:'all 41 root CSS sources except unchanged third-party Skullet, apps/web/src CSS and both entry inline boot styles; colour literals and global paint aliases only in one styles.css :root token block',
      contrast:'20 fixed actual product text/icon IDs in each theme; exact sRGB relative luminance and alpha compositing over proven solid native backgrounds; text 4.5 and icons 3',
      headingVisibility:'non-whitespace grapheme Range bounds and intersecting paint candidates; read-only CDP text-owner hits with ignorePointerEventsNone; empty block centre is diagnostic only; missing or unsupported evidence never passes',
      font:'local WOFF2 responses plus FontFaceSet plus native CDP glyph ownership; separate induced local-font failure cases',
      typography:'body/prose 15/16/17; existing dense navigation/chart controls and numerical axes recorded separately for P1/P2',
      isolation:'native inputs and actual product state only; no product DOM/style/font override; local static origin; no installs; independent R17/A9 unchanged'},cases:[],failures:[]};
  let settings,ownsOut=false,server,profile,chrome,browser,stage='arguments',stderr='';
  try {
    settings = parseP0Arguments(argv);
    if (settings.help) {console.log('Usage: node scripts/verify-ui-renewal-p0-browser.mjs --out NEW_DIRECTORY [--browser CHROME_PATH] [--source-only]\n10 cases: BTC/ETH × 320/1440 × light/dark + 320 local-font fallback for each instrument.\nSource-only or blocked browser runs never qualify P0 and exit nonzero. Existing evidence directories are rejected. No installs.');return report;}
    stage = 'output directory';await mkdir(dirname(settings.out),{recursive:true});await mkdir(settings.out,{recursive:false});ownsOut = true;
    stage = 'source inventory';report.testedHead = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.workingTree = execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    const sources = await readP0Sources();Object.assign(report,{sourceAudit:sources.audit,tokenPairs:sources.tokenPairs,sourceHashes:sources.hashes,fontProvenance:sources.fonts,
      residualJsColors:sources.residualJsColors,excludedThirdParty:sources.excludedThirdParty});report.failures.push(...sources.fonts.issues);
    if (settings.sourceOnly) {report.failures.push('native browser matrix was not requested (--source-only); screenshots, computed contrast and actual fonts remain unverified');return report;}
    stage = 'browser executable';await access(settings.bin,constants.X_OK);report.browserExecutable = settings.bin;
    const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
    server = createServer(async (request,response) => {try {const path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);if (!path.startsWith(prefix+'/')) throw new Error('route');
      let file = resolve(site,'.'+path.slice(prefix.length));if (!file.startsWith(site+'/')) throw new Error('scope');if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');file = await realpath(file);if (!file.startsWith(site+'/')) throw new Error('scope');
      response.writeHead(200,{'content-type':mime[extname(file)] || 'application/octet-stream','cache-control':'no-store'});response.end(await readFile(file));
    } catch {response.writeHead(404);response.end('not found');}});
    stage = 'local static server';await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin = `http://127.0.0.1:${server.address().port}`, base = `${origin}${prefix}/index.html`;
    profile = await mkdtemp(resolve(tmpdir(),'atlas-ui-p0-'));stage = 'Chromium launch';
    chrome = spawn(settings.bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError;chrome.stderr.on('data',bytes => {stderr = (stderr+bytes).slice(-6000);});chrome.once('error',error => {launchError = error;});
    const port = await until(async () => {if (launchError) throw launchError;if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Chromium exited ${chrome.exitCode}/${chrome.signalCode}: ${stderr}`);
      try {return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');} catch {return null;}},'Chromium debugging endpoint');
    browser = await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.browser = await browser.send('Browser.getVersion');stage = 'native P0 matrix';
    const tokenNames = [...new Set(p0TokenPairs.flatMap(pair => [pair.foreground,pair.background]))];
    for (const spec of p0Cases) {
      const result = {...spec,status:'unverified',snapshots:[],screenshots:[],resources:[],blockedExternalRequests:[],failures:[]};report.cases.push(result);let cdp,context;
      try {
        ({browserContextId:context} = await browser.send('Target.createBrowserContext'));const {targetId} = await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context});
        const targets = await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();cdp = await Cdp.connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        for (const domain of ['Page','Runtime','Network','DOM','CSS']) await cdp.send(`${domain}.enable`);
        result.nativeWindowEnvelope = await verifyHeadlessWindowEnvelope(cdp,{width:spec.width,height:spec.height});
        const resources = new Map(), runtimeErrors = [];
        cdp.listeners.set('Network.requestWillBeSent',event => {resources.set(event.requestId,{...resources.get(event.requestId),url:event.request.url,local:new URL(event.request.url).origin === origin,type:event.type});});
        cdp.listeners.set('Network.responseReceived',event => {const value = resources.get(event.requestId);if (value) value.status = event.response.status;});
        cdp.listeners.set('Network.loadingFailed',event => {const value = resources.get(event.requestId);if (value) value.error = event.errorText;});
        cdp.listeners.set('Runtime.exceptionThrown',event => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'runtime exception'));
        cdp.listeners.set('Fetch.requestPaused',async event => {
          const url = new URL(event.request.url), local = url.origin === origin, blockedFont = local && spec.fallback && /\/fonts\/pretendard\/.*\.woff2$/.test(url.pathname);
          if (blockedFont) {const value = resources.get(event.networkId) || {url:event.request.url,local:true,type:'Font'};value.blockedForFallback = true;resources.set(event.networkId || event.requestId,value);await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});}
          else if (local || ['data:','blob:'].includes(url.protocol)) await cdp.send('Fetch.continueRequest',{requestId:event.requestId});
          else {result.blockedExternalRequests.push(event.request.url);await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});}
        });
        await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
        // Emulate a saved user preference before product boot; never assign a
        // product theme attribute or inject replacement colours/font styles.
        if (spec.theme === 'dark') await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.origin===${JSON.stringify(origin)}&&!sessionStorage.getItem('p0-preference-seeded')){localStorage.setItem(${JSON.stringify(p0ThemeStorageKey)},'dark');sessionStorage.setItem('p0-preference-seeded','1');}`});
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width<=620});
        result.requestedUrl = `${base}?symbol=${spec.symbol}`;await cdp.send('Page.navigate',{url:result.requestedUrl});await observedReady(cdp,spec.symbol);
        const initial = await evaluate(cdp,() => ({theme:document.documentElement.dataset.theme,stored:localStorage.getItem('atlas-ui-theme')}));result.initialPreference = initial;
        if (initial.theme !== spec.theme) result.failures.push(`initial product theme ${initial.theme} did not honour ${spec.theme === 'light' ? 'clean light default' : 'saved dark preference'}`);
        const chart = await inspectP0Snapshot(cdp,spec,'chart',p0PaintSamples,tokenNames);result.snapshots.push(chart);result.screenshots.push(await screenshot(cdp,settings.out,`${spec.id}-chart.png`));
        await openSettings(cdp);await settle(cdp);
        const settingsScan = await collectP0Settings({spec,
          readSnapshot:() => inspectP0Snapshot(cdp,spec,'settings',p0PaintSamples,tokenNames),readScroll:() => evaluate(cdp,readP0ReaderScroll),
          wheel:gesture => cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...gesture}),
          settle:async () => {await delay(120);await settle(cdp);},capture:id => screenshot(cdp,settings.out,`${spec.id}-${id}.png`)});
        result.snapshots.push(...settingsScan.snapshots);result.screenshots.push(...settingsScan.screenshots);
        result.settingsScroll = {missingIds:settingsScan.missingIds,stopReason:settingsScan.stopReason,gestures:settingsScan.scrolls};
        const settingsState = settingsScan.snapshots.at(-1);
        if (settingsState.themeControl?.pressed !== String(spec.theme === 'dark')) result.failures.push('theme control aria-pressed does not match the current theme');
        const documentNode = await cdp.send('DOM.getDocument',{depth:0}), node = await cdp.send('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:settingsState.font.selector});
        const fonts = node.nodeId ? await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId}) : {fonts:[]};
        result.resources = [...resources.values()];result.fontEvidence = {...settingsState.font,platformFonts:fonts.fonts,requests:result.resources};
        result.fontCheck = validateP0FontEvidence(result.fontEvidence,spec);result.failures.push(...result.fontCheck.failures);
        result.typographyChecks = result.snapshots.map(value => ({stage:value.stage,...validateP0Typography(value)}));
        result.failures.push(...result.typographyChecks.flatMap(value => value.failures));
        for (const snapshot of result.snapshots) {
          if (snapshot.overflow !== 0) result.failures.push(`${snapshot.stage}: horizontal overflow ${snapshot.overflow}px`);
          if (snapshot.theme !== spec.theme || snapshot.colorScheme !== spec.theme) result.failures.push(`${snapshot.stage}: actual colour scheme differs from ${spec.theme}`);
          // Unlike dense controls that are intentionally disclosed at one
          // width, the H1 must be visible in every case, including fallback.
          for (const sample of snapshot.samples.filter(value => value.visible || value.id === 'page-heading')) {
            sample.check = validateP0Paint(sample);sample.roleCheck = validateP0PaintRole(sample,new Map(Object.entries(report.sourceAudit.tokens)),spec.theme);
            if (sample.check.status !== 'passed') result.failures.push(`${snapshot.stage}/${sample.id}: ${sample.check.reason || `contrast ${sample.check.ratio} below ${sample.check.threshold}`}`);
            if (sample.roleCheck.status !== 'passed') result.failures.push(`${snapshot.stage}/${sample.id}: ${sample.roleCheck.reason}`);
          }
        }
        // Real input round trip and reload; source clocks/prices are untouched.
        const other = spec.theme === 'light' ? 'dark' : 'light';await click(cdp,'[data-atlas-theme-toggle]');
        await until(() => evaluate(cdp,theme => document.documentElement.dataset.theme === theme && localStorage.getItem('atlas-ui-theme') === theme,other),'native theme toggle persistence');
        await click(cdp,'[data-atlas-theme-toggle]');await until(() => evaluate(cdp,theme => document.documentElement.dataset.theme === theme && localStorage.getItem('atlas-ui-theme') === theme,spec.theme),'native theme toggle return');
        await closeSettings(cdp);await cdp.send('Page.reload',{ignoreCache:true});await observedReady(cdp,spec.symbol);
        result.reloadedPreference = await evaluate(cdp,() => ({theme:document.documentElement.dataset.theme,stored:localStorage.getItem('atlas-ui-theme')}));
        if (result.reloadedPreference.theme !== spec.theme || result.reloadedPreference.stored !== spec.theme) result.failures.push('theme preference did not survive reload');
        result.failures.push(...runtimeErrors.map(error => `runtime: ${error}`),...cdp.eventErrors.map(error => `CDP event: ${error}`));
        result.status = result.failures.length ? 'failed' : 'passed';
      } catch (error) {result.failures.push(error.stack || String(error));result.status = result.snapshots.length ? 'failed' : 'unverified';}
      finally {cdp?.close();if (context) await browser.send('Target.disposeBrowserContext',{browserContextId:context}).catch(error => {result.failures.push(`context cleanup: ${error.message}`);result.status = 'failed';});}
      report.failures.push(...result.failures.map(reason => `${spec.id}: ${reason}`));console.log(JSON.stringify({id:spec.id,status:result.status,screenshots:result.screenshots.length,failures:result.failures}));
    }
  } catch (error) {report.failures.push(`${stage}: ${error.stack || String(error)}`);report.blockedAt = stage;}
  finally {
    if (chrome) report.browserProcess = {exitCode:chrome.exitCode,signalCode:chrome.signalCode,stderr};browser?.close();chrome?.kill('SIGKILL');
    if (server?.listening) await new Promise(resolve => server.close(resolve));if (profile) await rm(profile,{recursive:true,force:true}).catch(error => report.failures.push(`profile cleanup: ${error.message}`));
    if (!settings?.help) {
      if (report.sourceHashes) {try {const after = await readP0Sources();report.sourceHashesAfter = after.hashes;report.sourceStable = JSON.stringify(report.sourceHashes) === JSON.stringify(after.hashes);if (!report.sourceStable) report.failures.push('served source bytes changed during verification');} catch (error) {report.sourceStable = false;report.failures.push(`source recheck: ${error.message}`);}}
      report.sampleCoverage = p0SampleCoverage(report.cases);Object.assign(report,p0FinalStatus(report));
      if (ownsOut) {try {report.reportWritten = true;await writeFile(resolve(settings.out,'report.json'),JSON.stringify(report,null,2)+'\n');} catch (error) {report.status = 'failed';report.qualifiesP0Verification = false;report.failures.push(`report write: ${error.stack || error}`);report.reportWritten = false;}}
      console.log(JSON.stringify({status:report.status,qualifiesP0Verification:report.qualifiesP0Verification,counts:report.counts,staticTokens:report.tokenPairs?.filter(pair => pair.status === 'passed').length || 0,
        actualContrastSamples:report.sampleCoverage.observed,failures:report.failures.length,reason:report.failures[0] || report.sourceAudit?.issues[0] || null,out:settings?.out || null,reportWritten:Boolean(report.reportWritten)}));
      if (report.status !== 'passed') process.exitCode = 1;
    }
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verifyUiRenewalP0Browser();
