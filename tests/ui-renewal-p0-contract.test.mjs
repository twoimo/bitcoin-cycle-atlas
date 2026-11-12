import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {runInNewContext} from 'node:vm';
import {
  inspectP0CssSources, inspectP0RootPaintTokens, inspectP0TokenPairs, p0Cases, p0ColorLiterals, p0Composite, p0Contrast,
  p0CssDeclarations, p0FinalStatus, p0FontFamily, p0PaintSamples, p0ParseColor, p0SampleCoverage,
  p0Thresholds, p0TokenPairs, readP0RootTokens, resolveP0Token, validateP0FontEvidence,
  validateP0Paint, validateP0PaintRole, validateP0Typography,
} from '../scripts/ui-renewal-p0-contract.mjs';
import {collectP0Settings,inspectP0Page,p0EvaluationExpression,parseP0Arguments,readP0ReaderScroll,readP0Sources} from '../scripts/verify-ui-renewal-p0-browser.mjs';
import {drawAtlasPriceChart} from '../dist/atlas-price-chart.js';
import {drawIntradayChart} from '../dist/intraday-chart.js';

const palette = `:root {
  --text: light-dark(#191f28,#f2f2f4); --muted: light-dark(#4e5968,#b0b0ba);
  --subtle: light-dark(#626d7b,#9a9aa5); --bg: light-dark(#fff,#101013);
  --surface: light-dark(#fff,#17171c); --surface-raised: light-dark(#f2f4f6,#1b1b21);
  --accent: #6c4dff; --accent-hover:#5a3bf0; --on-accent:#fff;
  --accent-ink:light-dark(#6c4dff,#b4a4ff); --positive-ink:light-dark(#097354,#66c3ab);
  --negative-ink:light-dark(#b3324b,#ec8190); --data-gold-ink:light-dark(#836110,#d8b56d);
  --icon:var(--text); --icon-muted:var(--muted); --focus:var(--accent-ink);
}`;
const approx = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('matrix fixes both instruments, both themes, both widths and separate fallback cases', () => {
  assert.equal(p0Cases.length,10); assert.equal(new Set(p0Cases.map(value => value.id)).size,10);
  for (const symbol of ['BTCUSD','ETHUSD']) {
    assert.deepEqual(p0Cases.filter(value => value.symbol === symbol && !value.fallback).map(({width,theme}) => [width,theme]),[[320,'light'],[320,'dark'],[1440,'light'],[1440,'dark']]);
    assert.equal(p0Cases.filter(value => value.symbol === symbol && value.fallback && value.width === 320).length,1);
  }
  assert.deepEqual(p0Thresholds,{text:4.5,icon:3});
});

test('twenty token pairs and twenty painted elements are distinct fixed inventories', () => {
  for (const list of [p0TokenPairs,p0PaintSamples]) {
    assert.equal(list.length,20); assert.equal(new Set(list.map(value => value.id)).size,20);
    assert.equal(list.filter(value => value.kind === 'text').length,16);
    assert.equal(list.filter(value => value.kind === 'icon').length,4);
  }
  assert.ok(p0PaintSamples.some(value => value.symbol === 'ETHUSD'));
  assert.ok(p0PaintSamples.some(value => value.stage === 'settings'));
  assert.equal(p0PaintSamples.find(value => value.id === 'chart-indicators').selector,'#atlas-mode-name');
  assert.equal(p0PaintSamples.find(value => value.id === 'btc-price-axis-basis').selector,'.price-axis-options > .price-axis-basis');
  assert.ok(!p0PaintSamples.some(value => ['.symbol-selector-name','.atlas-settings-body > p'].includes(value.selector)),'permanently hidden legacy copies are not required painted samples');
});

test('relative luminance has exact white/black and equal-colour anchors', () => {
  approx(p0Contrast('#000','#fff'),21); approx(p0Contrast('#fff','#000'),21);
  approx(p0Contrast('#6c4dff','#6c4dff'),1);
  approx(p0Contrast('#6c4dff','#fff'),5.068570630375775);
  assert.ok(p0Contrast('#8b95a1','#fff')<4.5);
  assert.ok(p0Contrast('#6c4dff','#101013')<4.5);
});

test('sRGB parser preserves alpha and rejects unsupported or out-of-range colour spaces', () => {
  assert.deepEqual(p0ParseColor('#abc'),[170,187,204,1]);
  assert.deepEqual(p0ParseColor('#1234'),[17,34,51,68/255]);
  assert.deepEqual(p0ParseColor('rgba(10,20,30,0.25)'),[10,20,30,.25]);
  assert.deepEqual(p0ParseColor('rgb(10 20 30 / 50%)'),[10,20,30,.5]);
  assert.deepEqual(p0ParseColor('color(srgb 0 0.5 1 / 0.2)'),[0,127.5,255,.2]);
  approx(p0ParseColor('rgb(100% 0% 0%)')[0],255);
  for (const value of ['red','oklch(50% .2 20)','color(display-p3 1 0 0)','rgb(300 0 0)','rgba(0 0 0 / -1)','rgb(NaN 0 0)','linear-gradient(#000,#fff)']) assert.throws(() => p0ParseColor(value),/colour/);
});

test('alpha colours are composited against actual opaque backing, never silently against white', () => {
  assert.deepEqual(p0Composite([0,0,0,.5],[255,255,255,1]),[127.5,127.5,127.5,1]);
  assert.deepEqual(p0Composite([255,0,0,0],[0,0,0,0]),[0,0,0,0]);
  approx(p0Contrast('rgba(0 0 0 / .5)','#fff'),p0Contrast([127.5,127.5,127.5,1],'#fff'));
  assert.throws(() => p0Contrast('#000','transparent'),/not proven opaque/);
});

test('balanced CSS inventory respects nested media, vendor properties, quoted delimiters and comments', () => {
  const css = `/* :root { --fake:#bad } */ :root { --text:#191f28; --copy:"not; a } declaration" }
    @media (max-width:620px) { .x { -webkit-tap-highlight-color:transparent; color:var(--text) } }
    .x::before {content:"#fff { :root }";background-image:url("icon.svg#abc");}`;
  const parsed = p0CssDeclarations(css);assert.deepEqual(parsed.issues,[]);
  assert.equal(parsed.declarations.length,6);
  assert.deepEqual(parsed.declarations.find(value => value.property === 'color').ancestors,['@media (max-width:620px)']);
  assert.equal(parsed.declarations.find(value => value.property.startsWith('-webkit')).selector,'.x');
  assert.ok(p0CssDeclarations(':root { --text:#000;').issues.length);
});

test('colour literals include fallbacks, modern constructors and named paint but exclude token names and resources', () => {
  assert.deepEqual(p0ColorLiterals('var(--white) currentColor transparent none url("x.svg#fff") "red"'),[]);
  assert.deepEqual(p0ColorLiterals('var(--text,#fff)'),['#fff']);
  assert.deepEqual(p0ColorLiterals('1px solid white'),['white']);
  assert.ok(p0ColorLiterals('color-mix(in srgb,var(--text),#fff 10%)').includes('#fff'));
  for (const value of ['rgb(1 2 3)','rgba(0,0,0,.1)','hsl(0 0% 0%)','oklch(20% .1 30)','color(srgb .1 .2 .3)']) assert.equal(p0ColorLiterals(value).length,1,value);
});

test('only canonical root custom-property literals pass source ownership', () => {
  const audit = inspectP0CssSources([{file:'dist/styles.css',source:palette+' body{color:var(--text);background:var(--bg)} html[data-theme="dark"]{color-scheme:dark}'},
    {file:'dist/chart.css',source:'.x{color:var(--text);border:1px solid var(--subtle)}'},
    {file:'dist/index.html#boot-style-0',source:'.boot{color:var(--text)}'}]);
  assert.equal(audit.status,'passed');assert.equal(audit.colorRootBlocks.length,1);assert.equal(audit.literalViolations.length,0);
  assert.equal(audit.tokens.get('--focus'),'var(--accent-ink)');assert.equal(audit.inventory.length,3);
});

test('hardcoded component, theme override, root fallback and boot colours fail with source locations', () => {
  const audit = inspectP0CssSources([{file:'dist/styles.css',source:palette+' body{color:#000} :root[data-theme="dark"]{--text:#fff}'},
    {file:'dist/chart.css',source:':root{--alias:#f00}.x{color:var(--text,white)}'},
    {file:'dist/index.html#boot-style-0',source:'body{background:#fff}'}]);
  assert.equal(audit.status,'failed');assert.equal(audit.literalViolations.length,5);
  assert.ok(audit.literalViolations.every(value => value.file && value.selector && value.line>=1));
});

test('multiple canonical colour root blocks, duplicate tokens and malformed CSS cannot report zero as success', () => {
  for (const source of [palette+':root{--another:#000}',palette+':root{--text:#000}',palette+'.x{color:var(--text)']) {
    assert.equal(inspectP0CssSources([{file:'dist/styles.css',source}]).status,'failed');
  }
  assert.equal(inspectP0CssSources([]).status,'failed');
  assert.throws(() => readP0RootTokens(':root{--x:#000;--x:#fff}'),/Duplicate/);
});

test('global paint aliases cannot override the canonical root even when the override has no literal colour', () => {
  for (const override of ['[data-theme="light"]{--text:var(--text)}','html[data-theme="dark"]{--focus:var(--muted)}',
    ':root{--another-ink:var(--text)}','body{--muted:var(--subtle)}']) {
    const audit = inspectP0CssSources([{file:'dist/styles.css',source:palette},{file:'dist/legacy.css',source:override}]);
    assert.equal(audit.literalViolations.length,0);assert.equal(audit.globalTokenViolations.length,1);assert.equal(audit.status,'failed');
  }
});

test('valid responsive type aliases and geometry are not misclassified as global paint overrides', () => {
  const audit = inspectP0CssSources([{file:'dist/styles.css',source:palette+':root{--type-body-lg:17px;--type-body-sm:15px;--body-size:var(--type-body-lg)} @media(max-width:620px){:root{--body-size:var(--type-body-sm)}}'},
    {file:'dist/geometry.css',source:':root{--sidebar-width:48px}body[data-shell="chart"]{--sidebar-width:0px}.component{--local-ink:var(--text)}'}]);
  assert.equal(audit.status,'passed',JSON.stringify(audit.issues));assert.equal(audit.globalTokenViolations.length,0);
  assert.ok(audit.rootPaintTokens.nonPaint.some(row => row.name === '--body-size' && row.value === '17px'));
  assert.ok(!audit.rootPaintTokens.rows.some(row => row.name === '--body-size'));
});

test('all canonical paint aliases resolve in each theme, including shadows; cycles cannot disappear as geometry', () => {
  const tokens = readP0RootTokens(palette+':root{--shadow:0 10px 40px var(--subtle);--size:16px;--body-size:var(--size)}');
  const resolved = inspectP0RootPaintTokens(tokens);
  assert.equal(resolved.status,'passed');assert.equal(resolved.rows.filter(row => row.name === '--shadow' && row.kind === 'composite-paint').length,2);
  assert.ok(resolved.rows.every(row => !row.value.includes('var(')));assert.equal(resolved.nonPaint.filter(row => row.name === '--body-size').length,2);
  tokens.set('--legacy-rule','var(--missing-rule)');tokens.set('--cycle-a','var(--cycle-b)');tokens.set('--cycle-b','var(--cycle-a)');
  const failed = inspectP0RootPaintTokens(tokens);assert.equal(failed.status,'failed');
  assert.equal(failed.rows.filter(row => row.name === '--legacy-rule' && row.status === 'failed').length,2);
  assert.equal(failed.rows.filter(row => row.name === '--cycle-a' && /Cyclic/.test(row.reason)).length,2);
});

test('light-dark aliases and nested variable fallbacks resolve separately with provenance', () => {
  const tokens = readP0RootTokens(palette+':root{--alias:var(--missing,light-dark(var(--text),#eee))}');
  assert.deepEqual(resolveP0Token(tokens,'--alias','light').chain,['--alias','--text']);
  assert.deepEqual(resolveP0Token(tokens,'--alias','dark').color,[238,238,238,1]);
  assert.equal(resolveP0Token(tokens,'--focus','dark').value,'#b4a4ff');
  assert.throws(() => resolveP0Token(tokens,'--not-a-token','light'),/Missing/);
  assert.throws(() => resolveP0Token(new Map([['--a','var(--b)'],['--b','var(--a)']]),'--a','light'),/Cyclic/);
  assert.throws(() => resolveP0Token(tokens,'--text','system'),/Unknown theme/);
});

test('the agreed accessible palette passes all forty exact token pairs; old subtle and dark accent fail', () => {
  const tokens = readP0RootTokens(palette), pairs = inspectP0TokenPairs(tokens);
  assert.equal(pairs.length,40);assert.ok(pairs.every(pair => pair.status === 'passed'),JSON.stringify(pairs.filter(pair => pair.status !== 'passed')));
  tokens.set('--subtle','light-dark(#8b95a1,#9a9aa5)');tokens.set('--accent-ink','#6c4dff');
  const changed = inspectP0TokenPairs(tokens);
  assert.equal(changed.find(pair => pair.id === 'subtle-on-bg' && pair.theme === 'light').status,'failed');
  assert.equal(changed.find(pair => pair.id === 'accent-ink-on-bg' && pair.theme === 'dark').status,'failed');
  tokens.delete('--muted');assert.equal(inspectP0TokenPairs(tokens).find(pair => pair.id === 'muted-on-bg').status,'unverified');
});

test('actual BTC observed line/isolated point and ETH close line use theme ink with at least 3:1 plot contrast', async () => {
  // A minimal SVG interface captures the real renderers' emitted markup.
  // Glyph metrics below are deterministic model inputs, not browser evidence.
  class SvgNode {
    constructor(tag='g',doc=null) {this.tagName=tag;this.ownerDocument=doc;this.attrs=new Map();this.nodes=new Map();this.children=[];this.dataset={};this.textContent='';this.parentNode=null;this.parentElement=null;}
    setAttribute(name,value) {this.attrs.set(name,String(value));} getAttribute(name) {return this.attrs.get(name)??null;} removeAttribute(name) {this.attrs.delete(name);}
    appendChild(node) {this.children.push(node);node.parentNode=this;node.parentElement=this;return node;} append(...nodes) {for(const node of nodes)this.appendChild(node);}
    removeChild(node) {this.children=this.children.filter(child=>child!==node);node.parentNode=null;node.parentElement=null;} remove() {this.parentNode?.removeChild(this);}
    querySelector(selector) {if(!this.nodes.has(selector))this.nodes.set(selector,new SvgNode('g',this.ownerDocument));return this.nodes.get(selector);}
    querySelectorAll(selector) {return selector==='text'?[0,1,2,3].map(index=>this.querySelector(`text-${index}`)):selector==='*'?this.children.flatMap(child=>[child,...child.querySelectorAll('*')]):[];}
    getComputedTextLength() {return this.textContent.length*Number(this.getAttribute('font-size'))*.6;}
    getBBox() {return {x:0,y:0,width:this.getComputedTextLength(),height:Number(this.getAttribute('font-size'))};}
    focus() {} closest() {return null;}
  }
  const fixture = id => {
    const doc={createElementNS:(_namespace,tag)=>new SvgNode(tag,doc),defaultView:{getComputedStyle:()=>({fontFamily:'Model Digits',fontWeight:'400',fontStyle:'normal',letterSpacing:'normal'})}};
    const svg=new SvgNode('svg',doc);return Object.assign(svg,{id,clientWidth:390,clientHeight:520,innerHTML:'',parentElement:{style:{setProperty(){}}},getBoundingClientRect:()=>({left:0,top:0,width:390,height:520})});
  };
  const rows=Object.freeze([{date:'2026-10-20',price:100},{date:'2026-10-21',price:110},{date:'2026-10-23',price:105}].map(Object.freeze));
  const first=Date.parse('2026-10-20T00:00:00Z')/1000;
  const candles=Object.freeze([100,110,105].map((close,index)=>Object.freeze({time:first+index*3600,date:new Date((first+index*3600)*1000).toISOString(),open:close-2,high:close+3,low:close-4,close,volume:10+index})));
  const before=JSON.stringify({rows,candles}), btc=fixture('observed-ink-btc'), eth=fixture('observed-ink-eth');
  drawAtlasPriceChart({svg:btc,rows,start:rows[0].date,end:rows.at(-1).date,split:rows.at(-1).date,showVolume:false,showDrawdown:false,showHistoricalEvents:false});
  drawIntradayChart({svg:eth,series:{candles,interval:'1h',source:'Coinbase',product:'ETH-USD',retrievedAt:'2026-10-21T00:00:00Z'},chartType:'line',showVolume:false,range:{start:first,end:first+7200}});
  const attributes = (svg,name) => {
    const markup=svg.innerHTML.match(new RegExp(`<[^>]+class="${name}"[^>]*>`))?.[0];assert.ok(markup,`${name} must actually render`);
    return Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
  };
  const observed=attributes(btc,'observed-close-line'), isolated=attributes(btc,'observed-close-point'), market=attributes(eth,'market-close-line');
  assert.equal(observed.stroke,'var(--observed-close-ink)');assert.equal(isolated.fill,'var(--observed-close-ink)');assert.equal(market.stroke,'var(--market-close-ink)');
  assert.match(observed.d,/^M.*L/);assert.match(market.d,/^M.*L/);assert.ok(Number.isFinite(Number(isolated.cx))&&Number.isFinite(Number(isolated.cy)));
  assert.equal(observed['stroke-width'],'1.8');assert.equal(market['stroke-width'],'1.7');assert.equal(isolated.r,'1.8');
  assert.equal(JSON.stringify({rows,candles}),before,'presentation changes preserve exact source observations');
  const tokens=readP0RootTokens(await readFile(new URL('../dist/styles.css',import.meta.url),'utf8'));
  for(const theme of ['light','dark'])for(const name of ['--observed-close-ink','--market-close-ink']) {
    const ratio=p0Contrast(resolveP0Token(tokens,name,theme).color,resolveP0Token(tokens,'--bg',theme).color);
    assert.ok(ratio>=3,`${name}/${theme}: ${ratio} must meet the graphical-object 3:1 contrast floor`);
  }
  for(const old of ['#e2eaf3','#dce7f2'])assert.ok(p0Contrast(old,'#fff')<3,'the old pale observed inks reproduce the light-theme defect');
});

const paint = (overrides={}) => ({visible:true,kind:'text',foreground:'#191f28',backgrounds:['transparent','#fff'],issues:[],...overrides});
test('native paint checks composite ancestry and retain unsupported backgrounds as unverified', () => {
  assert.equal(validateP0Paint(paint()).status,'passed');
  assert.equal(validateP0Paint(paint({foreground:'#999'})).status,'failed');
  assert.equal(validateP0Paint(paint({issues:['background image under sample']})).status,'unverified');
  assert.equal(validateP0Paint(paint({backgrounds:['transparent']})).status,'unverified');
  assert.equal(validateP0Paint(paint({visible:false})).status,'unverified');
  const translucent = paint({foreground:'#000',backgrounds:['rgba(255 255 255 / .5)','#000']});
  approx(validateP0Paint(translucent).ratio,p0Contrast('#000',[127.5,127.5,127.5,1]));
});

test('paint thresholds are applied without rounding a sub-threshold observation up', () => {
  const grey = ratio => {const linear = .05*(ratio-1);const c = linear<=.0031308 ? linear*12.92 : 1.055*linear**(1/2.4)-.055;return `rgb(${c*255} ${c*255} ${c*255})`;};
  for (const kind of ['text','icon']) {
    assert.equal(validateP0Paint(paint({kind,foreground:grey(p0Thresholds[kind]-.000001),backgrounds:['#000']})).status,'failed');
    assert.equal(validateP0Paint(paint({kind,foreground:grey(p0Thresholds[kind]+.000001),backgrounds:['#000']})).status,'passed');
  }
});

test('computed UI ink must match the active canonical role palette even when a preserved literal has enough contrast', () => {
  const tokens = readP0RootTokens(palette);
  assert.equal(validateP0PaintRole(paint(),tokens,'light').status,'passed');
  assert.equal(validateP0PaintRole(paint({foreground:'#b4a4ff'}),tokens,'dark').status,'passed');
  const legacy = paint({foreground:'#925b15'});assert.equal(validateP0Paint(legacy).status,'passed');
  assert.equal(validateP0PaintRole(legacy,tokens,'light').status,'failed');
  assert.equal(validateP0PaintRole(paint({foreground:'#f2f2f4'}),tokens,'light').status,'failed');
  assert.equal(validateP0PaintRole(paint({foreground:'color(display-p3 1 0 0)'}),tokens,'light').status,'unverified');
});

test('fixed coverage needs every ID in both themes and never substitutes repeated passing samples', () => {
  const cases = ['light','dark'].map(theme => ({id:theme,theme,fallback:false,snapshots:[{stage:'chart',samples:p0PaintSamples.map(spec => paint(spec))}]}));
  assert.equal(p0SampleCoverage(cases).status,'passed');assert.equal(p0SampleCoverage(cases).passed,40);
  const missing = structuredClone(cases);missing[1].snapshots[0].samples[0]=missing[1].snapshots[0].samples[1];
  assert.equal(p0SampleCoverage(missing).status,'unverified');assert.equal(p0SampleCoverage(missing).observed,39);
  const failed = structuredClone(cases);failed[0].snapshots[0].samples[0].foreground='#aaa';
  assert.equal(p0SampleCoverage(failed).status,'failed');
  const duplicateNode = structuredClone(cases);duplicateNode[0].snapshots[0].samples[0].actualSelector='#same-node';duplicateNode[0].snapshots[0].samples[1].actualSelector='#same-node';
  assert.equal(p0SampleCoverage(duplicateNode).status,'failed');
  assert.equal(p0SampleCoverage(cases.map(item => ({...item,fallback:true}))).observed,0);
});

test('body/prose size contract records dense controls separately without treating them as body exceptions', () => {
  const snapshot = {body:{fontSize:16,fontFamily:'"Pretendard Variable", sans-serif'},prose:[{selector:'p',visible:true,fontSize:17}],denseText:[{selector:'axis',fontSize:11}]};
  const value = validateP0Typography(snapshot);assert.equal(value.status,'passed');assert.equal(value.deferredDensity[0].fontSize,11);
  assert.equal(validateP0Typography({...snapshot,prose:[{selector:'p',visible:true,fontSize:13}]}).status,'failed');
  assert.equal(validateP0Typography({...snapshot,body:{...snapshot.body,fontSize:14}}).status,'failed');
  assert.equal(validateP0Typography({...snapshot,body:{...snapshot.body,fontFamily:'sans-serif'}}).status,'failed');
});

const font = (overrides={}) => ({declaredFamily:'"Pretendard Variable", "Noto Sans KR", sans-serif',text:'실제 가격 자료',visibleInk:true,overflow:0,
  faces:[{family:p0FontFamily,status:'loaded'}],requests:[{url:'http://localhost/fonts/subset.woff2',local:true,status:200}],
  platformFonts:[{familyName:p0FontFamily,postScriptName:'PretendardVariable-Regular',isCustomFont:true,glyphCount:6}],...overrides});
test('font success requires same-origin bytes, a loaded face and actual custom-font glyph ownership', () => {
  assert.equal(validateP0FontEvidence(font()).status,'passed');
  for (const overrides of [{faces:[]},{requests:[]},{platformFonts:[]},{text:'BTCUSD'},{visibleInk:false},{overflow:1}]) assert.equal(validateP0FontEvidence(font(overrides)).status,'failed');
  assert.equal(validateP0FontEvidence(font({platformFonts:[...font().platformFonts,{familyName:'System fallback',isCustomFont:false,glyphCount:1}]})).status,'failed');
  assert.equal(validateP0FontEvidence(font({requests:[{url:'https://fonts.gstatic.com/a.woff2',local:false,status:200}]})).status,'failed');
});

test('fallback evidence needs induced local failure plus real system glyphs and visible Korean text', () => {
  const fallback = font({faces:[{family:p0FontFamily,status:'error'}],requests:[{url:'http://localhost/fonts/subset.woff2',local:true,blockedForFallback:true}],platformFonts:[{familyName:'Noto Sans CJK KR',isCustomFont:false,glyphCount:6}]});
  assert.equal(validateP0FontEvidence(fallback,{fallback:true}).status,'passed');
  assert.equal(validateP0FontEvidence({...fallback,requests:[]},{fallback:true}).status,'failed');
  assert.equal(validateP0FontEvidence({...fallback,platformFonts:font().platformFonts},{fallback:true}).status,'failed');
  assert.equal(validateP0FontEvidence({...fallback,platformFonts:[]},{fallback:true}).status,'failed');
});

function completeReport() {
  return {sourceAudit:{status:'passed'},sourceStable:true,tokenPairs:inspectP0TokenPairs(readP0RootTokens(palette)),failures:[],
    sampleCoverage:{status:'passed',required:40,passed:40,rows:['light','dark'].flatMap(theme => p0PaintSamples.map(sample => ({id:sample.id,theme,status:'passed'})))},
    cases:p0Cases.map(spec => ({...spec,status:'passed'}))};
}
test('a blocked or absent browser cannot qualify P0 even with all static checks passing', () => {
  const report = completeReport();assert.equal(p0FinalStatus(report).qualifiesP0Verification,true);
  for (const changed of [{...report,cases:[]},{...report,cases:report.cases.slice(1)}, {...report,sourceStable:false},
    {...report,failures:['Chromium launch: EPERM']},{...report,cases:report.cases.map(item => ({...item,status:'unverified'}))}]) {
    assert.notEqual(p0FinalStatus(changed).status,'passed');assert.equal(p0FinalStatus(changed).qualifiesP0Verification,false);
  }
});

test('matching totals alone cannot replace complete unique token, paint or browser evidence', () => {
  const report = completeReport();
  for (const changed of [{...report,tokenPairs:Array(40).fill(report.tokenPairs[0])},
    {...report,sampleCoverage:{...report.sampleCoverage,rows:Array(40).fill(report.sampleCoverage.rows[0])}},
    {...report,cases:Array(10).fill(report.cases[0])},{...report,sourceAudit:{status:'failed'}},
    {...report,cases:report.cases.map((item,i) => i ? item : {...item,status:'failed'})}]) assert.equal(p0FinalStatus(changed).qualifiesP0Verification,false);
});

test('CLI requires a concrete new output directory and rejects unknown/incomplete options', () => {
  assert.throws(() => parseP0Arguments([]),/--out/);
  assert.throws(() => parseP0Arguments(['--out']),/incomplete/);
  assert.throws(() => parseP0Arguments(['--out','x','--skip-contrast']),/Unknown/);
  const settings = parseP0Arguments(['--out','nested/evidence','--browser','chrome','--source-only'],'/fixture');
  assert.equal(settings.out,'/fixture/nested/evidence');assert.equal(settings.bin,'/fixture/chrome');assert.equal(settings.sourceOnly,true);
  assert.equal(parseP0Arguments(['--help']).help,true);
});

// A deliberately small DOM/computed-style model exercises the ACTUAL
// serialized collector. These numbers are model inputs, not browser receipts.
function collectorModel({opacity='1'}={}) {
  const nativeStyle = {display:'block',visibility:'visible',opacity:'1',clip:'auto',clipPath:'none',maskImage:'none',backgroundColor:'transparent',backgroundImage:'none',
    color:'rgb(25, 31, 40)',webkitTextFillColor:'rgb(25, 31, 40)',filter:'none',mixBlendMode:'normal',stroke:'none',fill:'rgb(25, 31, 40)',strokeOpacity:'1',fillOpacity:'1',
    textShadow:'none',backgroundClip:'border-box',fontSize:'16px',fontFamily:'"Pretendard Variable", sans-serif',borderTopColor:'rgb(25, 31, 40)',colorScheme:'light',getPropertyValue:() => '#191f28'};
  const element = (tagName,id,textContent,style={}) => ({tagName,id,textContent,children:[],parentElement:null,style:{...nativeStyle,...style},scrollWidth:320,
    getAttribute(name) {return name === 'aria-pressed' ? 'false' : name === 'aria-label' ? '다크 모드' : null;},
    getBoundingClientRect() {return {left:4,right:164,top:4,bottom:48,width:160,height:44};},
    getClientRects() {return [this.getBoundingClientRect()];},closest(selector) {return selector === '[hidden]' ? null : this.tagName === 'BUTTON' ? this : null;},
    contains(other) {return this === other || this.children.some(child => child.contains(other));}});
  const root = element('HTML','',''), body = element('BODY','','가격 자료'), button = element('BUTTON','','다크 모드',{opacity});
  root.style.backgroundColor = '#fff';root.dataset = {symbol:'BTCUSD',theme:'light'};root.children=[body];body.parentElement=root;body.children=[button];button.parentElement=body;
  const fonts = [{family:p0FontFamily,status:'loaded',weight:'45 920'}];fonts.status='loaded';
  const document = {documentElement:root,body,fonts,querySelector:selector => selector === '[data-atlas-theme-toggle]' ? button : null,
    querySelectorAll:selector => selector === 'body *' || selector === '[data-atlas-theme-toggle]' ? [button] : [],
    elementFromPoint:() => button,createRange:() => ({selectNodeContents(){},getClientRects:() => [button.getBoundingClientRect()]})};
  return {document,getComputedStyle:node => node.style,innerWidth:320,innerHeight:900,location:{href:'http://fixture/index.html?symbol=BTCUSD'},localStorage:{getItem:() => null}};
}

test('actual collector survives CDP-style serialization with no imported helper globals', () => {
  const model = collectorModel(), spec = p0Cases[0], samples = [p0PaintSamples.find(sample => sample.id === 'theme-toggle')];
  const result = runInNewContext(p0EvaluationExpression(inspectP0Page,[spec,'settings',samples,['--text']]),model);
  assert.equal(result.samples.length,1);assert.equal(result.samples[0].visible,true);assert.equal(validateP0Paint(result.samples[0]).status,'passed');
  assert.equal(result.font.text,'다크 모드');assert.equal(result.font.visibleInk,true);assert.equal(result.overflow,0);
  assert.equal(result.rootTokens['--text'],'#191f28');assert.equal(result.themeControl.pressed,'false');
});

test('collector never turns unsupported group opacity into a passing colour sample or real-ink proof', () => {
  const result = runInNewContext(p0EvaluationExpression(inspectP0Page,[p0Cases[0],'settings',[p0PaintSamples[7]],[]]),collectorModel({opacity:'.5'}));
  assert.equal(validateP0Paint(result.samples[0]).status,'unverified');assert.match(result.samples[0].issues.join(' '),/group opacity/);
  assert.equal(result.font.visibleInk,false);
});

test('a control inside the viewport but outside its reader scroll clip is not counted as visible ink', () => {
  const model = collectorModel(), body = model.document.body, button = body.children[0];
  Object.assign(body,{clientLeft:0,clientTop:0,clientWidth:160,clientHeight:44});body.style.overflowY='auto';
  button.getBoundingClientRect = () => ({left:4,right:164,top:80,bottom:124,width:160,height:44});
  const expression = p0EvaluationExpression(inspectP0Page,[p0Cases[0],'settings',[p0PaintSamples[7]],[]]);
  const clipped = runInNewContext(expression,model);assert.equal(clipped.samples[0].visible,false);assert.equal(clipped.font.visible,false);assert.equal(clipped.font.visibleInk,false);
  button.getBoundingClientRect = () => ({left:4,right:164,top:4,bottom:48,width:160,height:44});
  const exposed = runInNewContext(expression,model);assert.equal(exposed.samples[0].visible,true);assert.equal(exposed.font.visibleInk,true);
});

test('the restored price-axis explanation participates in the P0 prose floor', () => {
  const model = collectorModel(), paragraph = {...model.document.body.children[0],tagName:'P',id:'basis-model',textContent:'가격 자료의 범위를 기준으로 맞춥니다.'};
  const original = model.document.querySelectorAll;model.document.querySelectorAll = selector => selector.includes('.price-axis-options > .price-axis-basis') ? [paragraph] : original(selector);
  const state = runInNewContext(p0EvaluationExpression(inspectP0Page,[p0Cases[0],'settings',[],[]]),model);
  assert.equal(state.prose.length,1);assert.equal(state.prose[0].selector,'#basis-model');assert.equal(validateP0Typography(state).status,'passed');
  paragraph.style={...paragraph.style,fontSize:'13px'};
  const undersized = runInNewContext(p0EvaluationExpression(inspectP0Page,[p0Cases[0],'settings',[],[]]),model);
  assert.equal(validateP0Typography(undersized).status,'failed');
});

test('reader scrolling uses native wheel geometry and never treats overflow:hidden as user-scrollable', () => {
  const model = collectorModel(), body = model.document.body;
  Object.assign(body,{clientLeft:0,clientTop:0,clientWidth:160,clientHeight:44,scrollTop:0,scrollHeight:400});body.style.overflowY='auto';
  const original = model.document.querySelector;model.document.querySelector = selector => selector === '#chart-reader-body' ? body : original(selector);
  let state = runInNewContext(p0EvaluationExpression(readP0ReaderScroll),model);
  assert.equal(state.scrollable,true);assert.equal(state.maximum,356);assert.equal(state.point.x,160);assert.equal(state.point.y,26);
  body.style.overflowY='hidden';state = runInNewContext(p0EvaluationExpression(readP0ReaderScroll),model);assert.equal(state.scrollable,false);
  assert.equal(body.scrollTop,0,'read-only helper must leave the actual scroll position untouched');
});

test('native settings scan retains both scroll positions, fixed IDs, screenshots and earlier failed observations', async () => {
  const spec = p0Cases[0], required = p0PaintSamples.filter(sample => sample.stage === 'settings' && (!sample.symbol || sample.symbol === spec.symbol));
  let scrollTop = 0;const gestures = [];
  const early = new Set(['settings-title','reader-close-icon','btc-price-axis-legend','btc-invert-label']);
  const result = await collectP0Settings({spec,
    readSnapshot:async () => ({stage:'settings',font:{visible:scrollTop>0},samples:required.map(sample => paint({...sample,visible:scrollTop>0 || early.has(sample.id),
      ...(scrollTop === 0 && sample.id === 'btc-price-axis-legend' ? {foreground:'#999'} : {})}))}),
    readScroll:async () => ({available:true,scrollable:true,point:{x:300,y:400},scrollTop,maximum:400,clientHeight:300}),
    wheel:async gesture => {gestures.push(gesture);scrollTop+=gesture.deltaY;},settle:async () => {},capture:async id => ({file:`${id}.png`})});
  assert.deepEqual(gestures,[{x:300,y:400,deltaX:0,deltaY:180}]);assert.equal(result.snapshots.length,2);assert.equal(result.screenshots.length,2);
  assert.deepEqual(result.missingIds,[]);assert.equal(result.scrolls[0].before.scrollTop,0);assert.equal(result.scrolls[0].after.scrollTop,180);
  assert.equal(result.snapshots[0].captureId,'settings-0');assert.equal(result.snapshots[1].captureId,'settings-1');
  assert.equal(p0SampleCoverage([{...spec,snapshots:result.snapshots}]).status,'failed','later passing paint must not erase the earlier contrast failure');
});

test('a reader that cannot scroll or does not advance leaves missing samples unverified without fabricated exposure', async () => {
  const spec = p0Cases[0];let calls = 0;
  const api = {spec,readSnapshot:async () => ({stage:'settings',samples:[],font:{visible:false}}),
    readScroll:async () => ({available:true,scrollable:true,point:{x:300,y:400},scrollTop:0,maximum:400,clientHeight:300}),
    wheel:async () => {calls++;},settle:async () => {},capture:async id => ({file:id})};
  const stuck = await collectP0Settings(api);assert.equal(calls,1);assert.equal(stuck.snapshots.length,1);assert.match(stuck.stopReason,/did not advance/);assert.ok(stuck.missingIds.includes('theme-toggle'));
  calls=0;const hidden = await collectP0Settings({...api,readScroll:async () => ({available:true,scrollable:false,overflowY:'hidden'})});
  assert.equal(calls,0);assert.match(hidden.stopReason,/no further exposed native scroll path/);assert.equal(p0SampleCoverage([{...spec,snapshots:hidden.snapshots}]).observed,0);
});

test('current authored CSS and pinned local font bytes satisfy the source contract without claiming a browser pass', async () => {
  const source = await readP0Sources();
  assert.equal(source.scopeFiles.length,47);assert.equal(source.scopeFiles.filter(file => file.startsWith('apps/web/src/')).length,7);
  assert.equal(source.audit.status,'passed',JSON.stringify({issues:source.audit.issues,literals:source.audit.literalViolations,globalOverrides:source.audit.globalTokenViolations}));
  assert.equal(source.audit.colorRootBlocks.length,1);assert.equal(source.audit.literalViolations.length,0);
  assert.equal(source.audit.globalTokenViolations.length,0);assert.equal(source.audit.rootPaintTokens.status,'passed');
  assert.ok(source.audit.rootPaintTokens.rows.length>1000);assert.ok(source.audit.rootPaintTokens.rows.every(row => row.status === 'passed'));
  assert.equal(source.tokenPairs.filter(pair => pair.status === 'passed').length,40);assert.equal(source.fonts.status,'passed',source.fonts.issues.join('; '));
  assert.equal(source.fonts.faces,92);assert.equal(source.fonts.bytes,2957724);
  assert.ok(source.residualJsColors.length>0,'Existing JS/SVG literal inventory must not be misreported as whole-repository zero');
  assert.equal(p0FinalStatus({sourceAudit:source.audit,tokenPairs:source.tokenPairs,cases:[]}).qualifiesP0Verification,false);
});

test('a real CLI preflight failure creates missing parents, records the reason, and never overwrites its receipt', async t => {
  const fixture = await mkdtemp(resolve(tmpdir(),'atlas-p0-contract-'));t.after(() => rm(fixture,{recursive:true,force:true}));
  const out = resolve(fixture,'missing-parent','run'), script = fileURLToPath(new URL('../scripts/verify-ui-renewal-p0-browser.mjs',import.meta.url));
  const command = promisify(execFile), args = [script,'--out',out,'--browser',resolve(fixture,'absent-browser')];
  const first = await command(process.execPath,args).catch(error => error);assert.equal(first.code,1);
  const bytes = await readFile(resolve(out,'report.json'),'utf8'), report = JSON.parse(bytes);
  assert.equal(report.status,'unverified');assert.equal(report.qualifiesP0Verification,false);assert.equal(report.reportWritten,true);
  assert.equal(report.counts.attempted,0);assert.equal(report.sampleCoverage.observed,0);
  assert.equal(report.blockedAt,'browser executable');assert.match(report.failures.join('\n'),/ENOENT/);
  assert.match(first.stdout,/"reason":"browser executable:/);
  await writeFile(resolve(out,'sentinel'),'preserved');
  const second = await command(process.execPath,args).catch(error => error);assert.equal(second.code,1);assert.match(second.stdout,/EEXIST/);
  assert.equal(await readFile(resolve(out,'report.json'),'utf8'),bytes);assert.equal(await readFile(resolve(out,'sentinel'),'utf8'),'preserved');
});
