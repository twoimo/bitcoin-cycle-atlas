#!/usr/bin/env node
// R17: native Chromium paint/hit evidence against preserved market sources.
// Own local server/profile; no install, deployed origin, synthetic prices, or
// style overrides. Every geometry value below is an unrounded CSS coordinate.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, extname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {
  activePriceAxisBadge, comparePriceAxisStates, priceAxisAlignment, priceAxisOverlapEvidence, priceAxisOverlayCoverage,
  priceAxisObservationForState, priceAxisHasEmptyInsetClip, priceAxisPaintStyleState, priceAxisSourceExpectations, priceAxisSymbols, priceAxisWidths, validatePriceAxisState,
} from './price-axis-browser-contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), site = resolve(root,'dist'), prefix = '/bitcoin-cycle-atlas';
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const specs = ['default','candles'].flatMap(mode => priceAxisWidths.flatMap(width => priceAxisSymbols.map(symbol => ({id:`${symbol}-${width}-${mode}`, symbol, width, height:900, mode}))));
const sourcePaths = [
  'dist/index.html','dist/styles.css','dist/atlas-shell.css','dist/chart-workspace-controls.css','dist/site-before-shell.css','dist/price-axis.js','dist/atlas-price-chart.js',
  'dist/intraday-chart.js','dist/empty-price-chart.js','dist/chart-hover.js','dist/chart-overlays.js','dist/lab-view.js','dist/eth-view.js',
  'dist/equity-forecast-chart.js','dist/data/btc-daily.json','dist/data/btc-volume.json','dist/data/eth-ohlc.json',
  'scripts/verify-price-axis-browser.mjs','scripts/price-axis-browser-contract.mjs','scripts/headless-browser-window.mjs',
];

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map(); this.eventErrors = [];
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) {
        const listener = this.listeners.get(message.method);
        if (listener) Promise.resolve().then(() => listener(message.params || {})).catch(error => this.eventErrors.push(error.stack || String(error)));
        return;
      }
      const call = this.pending.get(message.id); if (!call) return;
      this.pending.delete(message.id); clearTimeout(call.timer);
      message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result || {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout')),15000);
      ws.addEventListener('open',() => {clearTimeout(timer);resolve();},{once:true});
      ws.addEventListener('error',() => {clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => {this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},30000);
      this.pending.set(id,{resolve,reject,timer}); this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close() {
    for (const entry of this.pending.values()) {clearTimeout(entry.timer);entry.reject(new Error('CDP target closed'));}
    this.pending.clear(); this.ws.close();
  }
}
async function evaluate(cdp, fn, ...args) {
  const helper = fn === inspectPriceAxis ? [priceAxisPaintStyleState,priceAxisHasEmptyInsetClip].map(helper => `const ${helper.name} = ${helper.toString()};`).join('\n') : '';
  const result = await cdp.send('Runtime.evaluate',{expression:`(()=>{${helper}return (${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')});})()`,awaitPromise:true,returnByValue:true});
  if (result.exceptionDetails) throw new Error(`Browser evaluation: ${JSON.stringify(result.exceptionDetails).slice(0,1000)}`);
  return result.result.value;
}
async function until(fn, label) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {const value = await fn(); if (value) return value;}
    catch (error) {if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) throw error;}
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

/** This function is serialized into the real browser. It reads existing DOM,
 * native hit results, font boxes, clipping, source/readout state, and actual
 * line endpoints; it never writes product DOM or presentation state. */
export function inspectPriceAxis(symbol) {
  const svg = document.querySelector(symbol === 'BTCUSD' ? '#lab-chart' : '#eth-chart'), geometryIssues = [];
  const box = node => {if (!node) return null; const r = node.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const rect = (left,top,right,bottom) => ({left,top,right,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)});
  const intersect = (a,b) => a && b ? rect(Math.max(a.left,b.left),Math.max(a.top,b.top),Math.min(a.right,b.right),Math.min(a.bottom,b.bottom)) : null;
  const nonempty = r => Boolean(r && r.right > r.left && r.bottom > r.top);
  const describe = node => node ? `${node.localName}${node.id ? '#'+node.id : ''}${node.getAttribute?.('class') ? '.'+node.getAttribute('class').trim().replace(/\s+/g,'.') : ''}` : null;
  const colorPaints = value => Boolean(value && !['none','transparent'].includes(value)
    && !/^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(value) && !/\/\s*0(?:\.0+)?\s*\)$/.test(value));
  const stylePath = node => {
    const result = [];
    for (let current = node; current; current = current.parentElement) {
      const css = getComputedStyle(current);
      result.push(Object.fromEntries(['display','visibility','opacity','contentVisibility','fill','fillOpacity','stroke','strokeOpacity','strokeWidth'].map(key => [key,css[key]])));
    }
    return result;
  };
  const visible = (node,options) => Boolean(node && priceAxisPaintStyleState(stylePath(node),options).visible);
  const transformed = (node,x,y) => {
    const matrix = node?.getScreenCTM?.();
    if (!matrix || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const point = new DOMPoint(x,y).matrixTransform(matrix); return {x:point.x,y:point.y};
  };
  const localBox = (node,left,top,width,height) => {
    const points = [[left,top],[left+width,top],[left,top+height],[left+width,top+height]].map(([x,y]) => transformed(node,x,y));
    if (points.some(point => !point)) return null;
    return rect(Math.min(...points.map(p => p.x)),Math.min(...points.map(p => p.y)),Math.max(...points.map(p => p.x)),Math.max(...points.map(p => p.y)));
  };
  const clipped = (node, original, issues = geometryIssues) => {
    // A zero-area clip on a box also clips every descendant. Resolve this
    // before reporting unsupported shapes lower in that invisible subtree.
    // display:contents has no box: its declaration cannot prove zero paint.
    const ancestors = [];
    for (let current = node; current; current = current.parentElement) {
      const css = getComputedStyle(current);
      if (css.display !== 'contents' && priceAxisHasEmptyInsetClip(css.clipPath)) return null;
      ancestors.push({current,css});
    }
    let result = original;
    for (const {current,css} of ancestors) {
      if (!result) break;
      const clip = css.clipPath;
      if (clip && clip !== 'none') {
        const id = clip.match(/#([^"')]+)["']?\)$/)?.[1], path = id && document.getElementById(id), children = path ? [...path.children] : [];
        if (!path || path.getAttribute('clipPathUnits') === 'objectBoundingBox' || children.length !== 1 || children[0].localName !== 'rect' || path.hasAttribute('transform') || children[0].hasAttribute('transform')) issues.push(`unsupported clip geometry on ${describe(current)}: ${clip}`);
        else {
          const child = children[0], read = name => Number(child.getAttribute(name) || 0);
          result = intersect(result,localBox(current,read('x'),read('y'),read('width'),read('height')));
        }
      }
      // Actual clipping owners, including the outer SVG. Border widths do not
      // enter this chart's zero-border viewport; keep the raw owner rectangle.
      if (/(hidden|clip|auto|scroll)/.test(css.overflowX + css.overflowY)) {
        const owner = box(current);
        if (owner) result = rect(/(hidden|clip|auto|scroll)/.test(css.overflowX) ? Math.max(result.left,owner.left) : result.left,
          /(hidden|clip|auto|scroll)/.test(css.overflowY) ? Math.max(result.top,owner.top) : result.top,
          /(hidden|clip|auto|scroll)/.test(css.overflowX) ? Math.min(result.right,owner.right) : result.right,
          /(hidden|clip|auto|scroll)/.test(css.overflowY) ? Math.min(result.bottom,owner.bottom) : result.bottom);
      }
    }
    return result;
  };
  const owners = [...(svg?.querySelectorAll('[data-price-axis-paint-layer]') || [])];
  const ownerKey = node => {const owner = node?.closest?.('[data-price-axis-paint-layer]'); return owner && owner.ownerSVGElement === svg ? `${svg.id}:price-axis-paint-layer:${owners.indexOf(owner)}` : null;};
  const hitAt = (target,r) => {
    if (!nonempty(r)) return null;
    const x = (r.left+r.right)/2, y = (r.top+r.bottom)/2, hit = document.elementFromPoint(x,y), owner = target.closest('[data-price-axis-paint-layer]');
    return {x,y,target:describe(hit),targetId:hit?.id || null,ownerKey:ownerKey(hit),chartId:hit?.closest?.('svg')?.id || null,
      relationship:hit && (hit === target || target.contains(hit)) ? 'self' : owner && hit && owner.contains(hit) ? 'paint-layer' : 'other',
      stack:document.elementsFromPoint(x,y).slice(0,10).map(describe)};
  };
  const textAnchor = text => text ? transformed(text,Number(text.getAttribute('x')),Number(text.getAttribute('y'))) : null;
  const entry = (node,key,tag = false) => {
    if (!node) return null;
    const r = box(node), text = tag ? node.querySelector('text') : node, paintIssues = [], paintRect = clipped(node,r,paintIssues), textStyles = stylePath(text);
    const displayed = visible(node) || tag && priceAxisPaintStyleState(textStyles,{content:true}).ink;
    return {key,text:text?.textContent.trim() || '',textStyles,rect:r,paintRect,painted:Boolean(displayed && nonempty(r) && nonempty(paintRect)),visibility:getComputedStyle(node).visibility,explicitVisibility:node.getAttribute('visibility'),
      ownerKey:ownerKey(node),anchor:tag ? undefined : textAnchor(text),textAnchor:tag ? textAnchor(text) : undefined,textRect:tag ? box(text) : undefined,
      hit:displayed ? hitAt(node,r) : null,paintIssues};
  };
  const ticks = [...(svg?.querySelectorAll('[data-price-axis-label="tick"]') || [])].map((node,index) => entry(node,`tick-${index}`));
  const latest = entry(svg?.querySelector('.chart-latest-price-tag'),'latest',true);
  const cursor = entry(svg?.querySelector('.cross-price-tag,.market-price-tag'),'cursor',true);
  const boundaries = Object.fromEntries(['axis','top','bottom'].map(kind => [kind,[...(svg?.querySelectorAll(`[data-price-axis-boundary="${kind}"]`) || [])].map((node,index) => {
    const css = getComputedStyle(node), raw = box(node), matrix = node.getScreenCTM(), half = Number.parseFloat(css.strokeWidth)/2, fixed = css.vectorEffect === 'non-scaling-stroke';
    const dx = fixed ? half : half * Math.hypot(matrix.a,matrix.c), dy = fixed ? half : half * Math.hypot(matrix.b,matrix.d);
    const paintRect = clipped(node,rect(raw.left-dx,raw.top-dy,raw.right+dx,raw.bottom+dy));
    return {key:`${kind}-${index}`,element:describe(node),ownerKey:ownerKey(node),start:transformed(node,Number(node.getAttribute('x1')),Number(node.getAttribute('y1'))),end:transformed(node,Number(node.getAttribute('x2')),Number(node.getAttribute('y2'))),
      paintRect,painted:visible(node) && colorPaints(css.stroke) && Number(css.strokeOpacity) > 0 && nonempty(paintRect),stroke:css.stroke,strokeWidth:Number.parseFloat(css.strokeWidth),dash:css.strokeDasharray};
  })]));
  const obstacles = [], overlayRoots = new Set(document.querySelectorAll('.instrument-indicator-manager,#chart-indicator-manager,#atlas-chart-legend,.chart-legend-dock,#eth-forecast-note,.eth-forecast-note,.workbench-market-info,.atlas-readout,.atlas-quote-hud,.eth-readout,.eth-readout-source,.lab-chart-foot'));
  const seen = new Set();
  const addObstacle = (node,category,r,key) => {
    if (!visible(node) || !nonempty(r)) return;
    const paintRect = clipped(node,r);
    const sameSvg = node.ownerSVGElement === svg, relation = sameSvg && owners[0] ? owners[0].compareDocumentPosition(node) : 0;
    const paintOrder = sameSvg ? relation & Node.DOCUMENT_POSITION_PRECEDING ? 'before-axis' : relation & Node.DOCUMENT_POSITION_FOLLOWING ? 'after-axis' : 'unknown' : 'html-overlay';
    const stacking = [];
    if (!sameSvg) for (let current=node;current && current !== svg?.parentElement;current=current.parentElement) {
      const css = getComputedStyle(current);
      if (css.position !== 'static' || css.zIndex !== 'auto') stacking.push({element:describe(current),position:css.position,zIndex:css.zIndex,pointerEvents:css.pointerEvents});
    }
    if (nonempty(paintRect)) obstacles.push({key,category,element:describe(node),rawRect:r,paintRect,surface:sameSvg ? 'svg' : 'html',chartId:sameSvg ? svg.id : null,paintOrder,stacking,pointerEvents:getComputedStyle(node).pointerEvents});
  };
  for (const root of overlayRoots) {
    for (const node of [root,...root.querySelectorAll('*')]) {
      if (seen.has(node) || !visible(node)) continue; seen.add(node);
      const css = getComputedStyle(node), r = box(node), category = node.closest('.instrument-indicator-manager,#chart-indicator-manager,#atlas-chart-legend,.chart-legend-dock,.eth-forecast-note') ? 'legend' : 'hud', key = `${category}-${seen.size}:${describe(node)}`;
      if (colorPaints(css.backgroundColor)) addObstacle(node,category,r,key+':background');
      for (const child of node.childNodes) if (visible(node,{content:true}) && child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(child);
        for (const [index,part] of [...range.getClientRects()].entries()) addObstacle(node,category,rect(part.left,part.top,part.right,part.bottom),`${key}:text-${index}`);
      }
      if (node.localName === 'svg' && visible(node,{content:true}) && node.querySelector('path,rect,circle,line,polygon,use')) addObstacle(node,category,r,key+':icon');
      for (const pseudo of ['::before','::after']) {
        const style = getComputedStyle(node,pseudo);
        // Pseudo elements have no native client-rectangle API. Their owner's
        // raw rectangle is a conservative paint bound, never an excuse to
        // allow a positive overlap or to manufacture a smaller painted box.
        const paintedPseudo = colorPaints(style.backgroundColor) || ['borderTop','borderRight','borderBottom','borderLeft'].some(edge => Number.parseFloat(style[edge+'Width']) > 0 && colorPaints(style[edge+'Color'])) || style.content !== '""';
        if (style.content && !['none','normal'].includes(style.content) && paintedPseudo && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0) addObstacle(node,category,r,key+pseudo+':conservative-owner-bound');
      }
    }
  }
  for (const [index,node] of [...(svg?.querySelectorAll('text,rect,path,line,circle,ellipse,polygon,polyline,image,use') || [])].entries()) {
    if (ownerKey(node) || node.closest('defs') || !visible(node,{content:true})) continue;
    const event = node.closest('[data-history-event],[data-cycle-marker],[data-cycle-interval],[data-cycle-clock],[data-next-turn],.history-event-preview,.cycle-interval-overlay-layer');
    const forecast = node.closest('[data-forecast-evidence],.equity-forecast-layer,.forecast-event-guide,[data-indicator-layer="range"]') || node.closest('.price-series-layer') && !node.closest('.observed-candle,.observed-candles-batched') && !node.matches('.observed-close-line,.observed-close-point');
    const category = event ? 'event' : forecast ? 'forecast' : null; if (!category) continue;
    const css = getComputedStyle(node), fill = colorPaints(css.fill) && Number(css.fillOpacity) > 0, stroke = colorPaints(css.stroke) && Number(css.strokeOpacity) > 0 && Number.parseFloat(css.strokeWidth) > 0;
    if (!fill && !stroke) continue;
    let r = box(node);
    if (stroke && r) {
      const matrix = node.getScreenCTM(), half = Number.parseFloat(css.strokeWidth)/2, fixed = css.vectorEffect === 'non-scaling-stroke';
      const dx = fixed ? half : half * Math.hypot(matrix.a,matrix.c), dy = fixed ? half : half * Math.hypot(matrix.b,matrix.d);
      r = rect(r.left-dx,r.top-dy,r.right+dx,r.bottom+dy);
    }
    addObstacle(node,category,r,`${category}-${index}:${describe(node)}`);
  }
  const view = svg?.viewBox.baseVal, frame = view ? localBox(svg,view.x,view.y,view.width,view.height) : null;
  const plotStart = svg && transformed(svg,Number(svg.dataset.plotLeft),Number(svg.dataset.plotTop));
  const plotEnd = svg && transformed(svg,Number(svg.dataset.plotRight),Number(svg.dataset.priceBottom));
  const raw = symbol === 'BTCUSD' ? window.__atlasPriceAxisReadout || null : null;
  const readout = symbol === 'BTCUSD'
    ? {priceText:document.querySelector('#lab-metrics .readout-main strong')?.textContent.trim() || '',date:raw?.date?.slice(0,10) || null,kind:document.querySelector('#lab-metrics')?.dataset.kind || null,raw,title:document.querySelector('#lab-metrics')?.title || '',sourceText:document.querySelector('.workbench-market-info')?.textContent.trim() || ''}
    : {priceText:document.querySelector('#eth-price')?.textContent.trim() || '',date:document.querySelector('#eth-bar-time')?.getAttribute('datetime')?.slice(0,10) || null,kind:document.querySelector('#eth-kind')?.textContent.trim() === '관측 종가' ? 'observed' : document.querySelector('#eth-kind')?.textContent.trim(),raw:null,sourceText:document.querySelector('.eth-readout-source,.workbench-market-info')?.textContent.trim() || ''};
  const counts = Object.fromEntries(['legend','event','forecast','hud'].map(kind => [kind,obstacles.filter(item => item.category === kind).length]));
  const eventControl = document.querySelector(symbol === 'BTCUSD' ? '#atlas-history-events' : '#eth-history-visible');
  const enabled = {event:eventControl ? eventControl.checked : null,forecast:new URLSearchParams(location.search).get('forecast') === 'off' ? false : null,legend:null};
  const observations = Object.fromEntries(['legend','event','forecast'].map(category => [category,{paintObjectCount:counts[category],enabled:enabled[category],
    reason:counts[category] > 0 ? 'paint observed' : enabled[category] === false ? 'disabled by product control' : document.documentElement.dataset.boot !== 'ready' ? 'product not ready' : 'no painted objects in current rendered state',
    renderedCount:category === 'event' ? svg?.dataset.historyEventCount ?? null : category === 'forecast' ? svg?.dataset.forecastPointCount ?? null : null}]));
  return {symbol,width:innerWidth,height:innerHeight,url:location.href,boot:document.documentElement.dataset.boot,page:document.body.dataset.page,
    interval:svg?.dataset.interval || document.querySelector('[data-lab-frequency][aria-pressed="true"]')?.dataset.labFrequency || null,
    chartType:svg?.dataset.chartType || null,unit:svg?.dataset.unit || null,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
    chart:svg ? {id:svg.id,rect:box(svg),frame,painted:visible(svg),viewBox:svg.getAttribute('viewBox'),plot:plotStart && plotEnd ? {left:plotStart.x,top:plotStart.y,right:plotEnd.x,bottom:plotEnd.y} : null,dataset:{...svg.dataset}} : null,
    ownerCount:owners.length,owner:owners[0] ? {key:ownerKey(owners[0]),chartId:owners[0].ownerSVGElement?.id,element:describe(owners[0]),lastSvgChild:owners[0] === svg.lastElementChild} : null,
    ticks,latest,cursor,readout,boundaries,obstacles,geometryIssues:[...new Set(geometryIssues)],
    overlays:{paintObjectCounts:counts,observations,unobservedCategories:['legend','event','forecast'].filter(kind => counts[kind] === 0),
      controls:[...document.querySelectorAll('#atlas-history-events,#eth-history-visible,#lab-band,[data-native-setting],#eth-forecast-note')].map(node => ({id:node.id,setting:node.dataset.nativeSetting || null,checked:'checked' in node ? node.checked : null,hidden:node.hidden,painted:visible(node)}))},
    fonts:{status:document.fonts.status,family:svg ? getComputedStyle(svg).fontFamily : null}};
}

async function settled(cdp,spec) {
  let previous = null, count = 0;
  return until(async () => {
    await evaluate(cdp,async () => {await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
    const state = await evaluate(cdp,inspectPriceAxis,spec.symbol), key = JSON.stringify(state);
    count = previous === key ? count+1 : 0; previous = key;
    return count >= 2 ? state : null;
  },`${spec.id} stable paint/hit state`);
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path,sha256(await readFile(resolve(root,path)))])));
}
function options(argv) {
  const result = {out:resolve(root,'build/price-axis-browser'),bin:process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',help:false};
  for (let index=0;index<argv.length;index++) {
    const key = argv[index];
    if (key === '--help') {result.help = true;continue;}
    if (!['--out','--browser'].includes(key) || !argv[index+1] || argv[index+1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${key}`);
    result[key === '--out' ? 'out' : 'bin'] = resolve(root,argv[++index]);
  }
  return result;
}

export async function verifyPriceAxisBrowser(argv = process.argv.slice(2)) {
  const report = {schemaVersion:1,kind:'atlas-price-axis-browser',recordedAt:new Date().toISOString(),qualifiesFullVerification:false,qualifiesPriceAxisVerification:false,
    methodology:{geometry:'unrounded native CSS coordinates',occlusion:'strict zero foreground intersection of clip-aware painted bounds; same-SVG paint behind the axis is separately recorded as underlap; pseudo paint uses conservative native owner bounds; native center elementFromPoint',frame:'complete SVG 0..height axis and left-frame top/bottom grid; visible centerline endpoints, allowing normal outer half-stroke clipping',sources:'preserved local JSON, independent of DOM labels',network:'own static origin only; external requests aborted',matrix:'8 default routes + 8 explicit candle routes; all required'},
    requiredCases:specs.length,cases:[],comparisons:[],failures:[],sourceFiles:{},testedHead:null};
  let settings, ownsOut = false, server, chrome, profile, browser, stage = 'arguments', browserStderr = '';
  try {
    settings = options(argv);
    if (settings.help) {console.log('Usage: node scripts/verify-price-axis-browser.mjs --out NEW_DIRECTORY [--browser CHROME_PATH]\nRuns BTCUSD/ETHUSD at 320/390/768/1440 × 900, default and candle views (16 cases).\nCreates a new append-only evidence directory; existing directories are rejected. No browser is installed.');return report;}
    stage = 'output directory';
    await mkdir(dirname(settings.out),{recursive:true}); await mkdir(settings.out,{recursive:false}); ownsOut = true;
    stage = 'source identity';
    report.testedHead = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    report.workingTree = execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    report.sourceFiles = await sourceHashes();
    const [btcDaily,ethArchive,btcVolume] = await Promise.all(['btc-daily.json','eth-ohlc.json','btc-volume.json'].map(async file => JSON.parse(await readFile(resolve(site,'data',file),'utf8'))));
    report.expectedSources = priceAxisSourceExpectations({btcDaily,ethArchive,btcVolume});
    stage = 'browser executable'; await access(settings.bin,constants.X_OK); report.browserExecutable = settings.bin;
    const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
    server = createServer(async (request,response) => {
      try {
        const path = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
        if (!path.startsWith(prefix+'/')) throw new Error('route');
        let file = resolve(site,'.'+path.slice(prefix.length)); if (!file.startsWith(site+'/')) throw new Error('scope');
        if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
        file = await realpath(file); if (!file.startsWith(site+'/')) throw new Error('scope');
        response.writeHead(200,{'content-type':mime[extname(file)] || 'application/octet-stream','cache-control':'no-store'}); response.end(await readFile(file));
      } catch {response.writeHead(404);response.end('not found');}
    });
    stage = 'local server'; await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const origin = `http://127.0.0.1:${server.address().port}`, base = `${origin}${prefix}/index.html`;
    profile = await mkdtemp(resolve(tmpdir(),'atlas-price-axis-'));
    stage = 'Chromium launch';
    chrome = spawn(settings.bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError = null;
    chrome.stderr.on('data',bytes => {browserStderr = (browserStderr+bytes).slice(-6000);}); chrome.once('error',error => {launchError = error;});
    const port = await until(async () => {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Chromium exited (exit=${chrome.exitCode}, signal=${chrome.signalCode}): ${browserStderr}`);
      try {return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}
      catch {if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Chromium exited (exit=${chrome.exitCode}, signal=${chrome.signalCode}): ${browserStderr}`);return null;}
    },'Chromium debugging port');
    browser = await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`); report.browser = await browser.send('Browser.getVersion');
    stage = 'browser matrix';
    for (const spec of specs) {
      const result = {...spec,status:'failed',failures:[],blockedExternalRequests:[]}; report.cases.push(result);
      let cdp, context;
      try {
        ({browserContextId:context} = await browser.send('Target.createBrowserContext'));
        const {targetId} = await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context});
        const targets = await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();
        cdp = await Cdp.connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
        result.nativeWindowEnvelope = await verifyHeadlessWindowEnvelope(cdp,{width:spec.width,height:spec.height});
        const runtimeErrors = []; cdp.listeners.set('Runtime.exceptionThrown',event => runtimeErrors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'runtime exception'));
        cdp.listeners.set('Fetch.requestPaused',async event => {
          const url = new URL(event.request.url);
          if (url.origin === origin) await cdp.send('Fetch.continueRequest',{requestId:event.requestId});
          else {result.blockedExternalRequests.push(event.request.url);await cdp.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});}
        });
        await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
        // Read the existing product event. This observer exposes no replacement
        // values and never drives application selection or presentation.
        await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:'document.addEventListener("atlas:readout",event=>{const row=event.detail||{};window.__atlasPriceAxisReadout=Object.fromEntries(["date","price","close","source","kind","frequency","unit","hovered"].filter(key=>row[key]!==undefined).map(key=>[key,row[key]]));});'});
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width<=620});
        result.requestedUrl = `${base}?symbol=${spec.symbol}${spec.mode === 'candles' ? '&type=candles' : ''}`;
        await cdp.send('Page.navigate',{url:result.requestedUrl});
        await until(() => evaluate(cdp,symbol => {
          if (document.documentElement.dataset.boot === 'error') throw new Error('product boot error');
          const svg = document.querySelector(symbol === 'BTCUSD' ? '#lab-chart' : '#eth-chart');
          return document.documentElement.dataset.boot === 'ready' && document.documentElement.dataset.symbol === symbol && document.body.dataset.page === 'outlook' && svg?.querySelector('[data-price-axis-label="tick"]') && Number(svg.dataset.visiblePointCount)>0 && (svg.dataset.chartType !== 'candles' || Number(svg.dataset.observedCandleCount)>0);
        },spec.symbol),`${spec.id} observed data ready`);
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});
        result.state = await settled(cdp,spec);
        const expected = report.expectedSources[spec.symbol];
        result.expectedObservation = priceAxisObservationForState(result.state,expected);
        if (spec.mode === 'candles' && result.state.chartType !== 'candles') result.failures.push('explicit candle route did not render candles');
        result.badge = {role:activePriceAxisBadge(result.state,expected).role,sameValueCursor:activePriceAxisBadge(result.state,expected).sameValueCursor};
        result.alignment = priceAxisAlignment(result.state,expected); result.overlap = priceAxisOverlapEvidence(result.state,expected);
        result.failures.push(...validatePriceAxisState(result.state,expected,spec));
        const shot = await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}), bytes = Buffer.from(shot.data,'base64');
        result.screenshot = {file:`${spec.id}.png`,sha256:sha256(bytes),bytes:bytes.length}; await writeFile(resolve(settings.out,result.screenshot.file),bytes);
        const after = await evaluate(cdp,inspectPriceAxis,spec.symbol);
        if (JSON.stringify(after) !== JSON.stringify(result.state)) result.failures.push('paint/hit state changed during screenshot capture');
        result.failures.push(...runtimeErrors.map(error => `runtime: ${error}`),...cdp.eventErrors.map(error => `CDP event: ${error}`));
        result.status = result.failures.length ? 'failed' : 'passed';
      } catch (error) {result.failures.push(error.stack || String(error));}
      finally {cdp?.close();if (context) await browser.send('Target.disposeBrowserContext',{browserContextId:context}).catch(error => result.failures.push(`context cleanup: ${error.message}`));}
      if (result.failures.length) result.status = 'failed';
      report.failures.push(...result.failures.map(reason => `${spec.id}: ${reason}`));
      console.log(JSON.stringify({id:result.id,status:result.status,failures:result.failures,screenshot:result.screenshot?.file || null,unobservedOverlays:result.state?.overlays.unobservedCategories || null}));
    }
    for (const mode of ['default','candles']) for (const width of priceAxisWidths) {
      const btc = report.cases.find(item => item.symbol === 'BTCUSD' && item.width === width && item.mode === mode), eth = report.cases.find(item => item.symbol === 'ETHUSD' && item.width === width && item.mode === mode);
      const comparison = {id:`BTC-ETH-${width}-${mode}`,width,mode,...comparePriceAxisStates(btc?.state,eth?.state,report.expectedSources)};
      comparison.status = comparison.failures.length ? 'failed' : 'passed'; report.comparisons.push(comparison);
      report.failures.push(...comparison.failures.map(reason => `${comparison.id}: ${reason}`));
    }
    report.sourceFilesAfter = await sourceHashes();
    if (JSON.stringify(report.sourceFilesAfter) !== JSON.stringify(report.sourceFiles)) report.failures.push('served source files changed during verification');
  } catch (error) {report.failures.push(`${stage}: ${error.stack || error}`);}
  finally {
    if (chrome) report.browserProcess = {exitCode:chrome.exitCode,signalCode:chrome.signalCode,stderr:browserStderr};
    browser?.close(); chrome?.kill('SIGKILL');
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    if (profile) await rm(profile,{recursive:true,force:true}).catch(error => report.failures.push(`profile cleanup: ${error.message}`));
    if (!settings?.help) {
      report.counts = {required:specs.length,attempted:report.cases.length,unattempted:specs.length-report.cases.length,passed:report.cases.filter(item => item.status === 'passed').length,failed:report.cases.filter(item => item.status === 'failed').length,
        default:report.cases.filter(item => item.mode === 'default' && item.status === 'passed').length,candles:report.cases.filter(item => item.mode === 'candles' && item.status === 'passed').length,
        alignmentPairs:report.comparisons.length,alignmentPassed:report.comparisons.filter(item => item.status === 'passed').length};
      report.coverage = priceAxisOverlayCoverage(report.cases);
      if (report.cases.length) for (const category of report.coverage.missing) report.failures.push(`coverage: ${category} paint was not observed in any case; zero occlusion remains unverified`);
      report.status = report.counts.passed === specs.length && report.counts.alignmentPassed === 8 && report.coverage.status === 'passed' && report.failures.length === 0 ? 'passed' : 'failed';
      report.qualifiesPriceAxisVerification = report.status === 'passed';
      if (ownsOut) try {await writeFile(resolve(settings.out,'report.json'),JSON.stringify(report,null,2)+'\n');}
      catch (error) {report.status = 'failed';report.qualifiesPriceAxisVerification = false;report.failures.push(`report write: ${error.stack || error}`);}
      console.log(JSON.stringify({status:report.status,counts:report.counts,coverage:{status:report.coverage.status,missing:report.coverage.missing,observedCaseCounts:Object.fromEntries(Object.entries(report.coverage.categories).map(([kind,value]) => [kind,value.observedCaseCount]))},failures:report.failures.length,reason:report.failures[0] || null,out:settings?.out || null,reportWritten:ownsOut && !report.failures.some(value => value.startsWith('report write:'))}));
      if (report.status !== 'passed') process.exitCode = 1;
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await verifyPriceAxisBrowser();
