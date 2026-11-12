// R19 P0 contracts. Source checks and synthetic unit inputs never qualify as
// native-browser evidence; the runner records that distinction explicitly.
export const p0FontFamily = 'Pretendard Variable';
export const p0FontCss = 'dist/fonts/pretendard/pretendard-variable.css';
export const p0ThemeStorageKey = 'atlas-ui-theme';
export const p0Thresholds = Object.freeze({text:4.5,icon:3});
export const p0Cases = Object.freeze([
  ...['BTCUSD','ETHUSD'].flatMap(symbol => [320,1440].flatMap(width => ['light','dark'].map(theme =>
    Object.freeze({id:`${symbol}-${width}-${theme}`,symbol,width,height:900,theme,fallback:false})))),
  ...['BTCUSD','ETHUSD'].map(symbol => Object.freeze({id:`${symbol}-320-font-fallback`,symbol,width:320,height:900,theme:'light',fallback:true})),
]);
export const p0TokenPairs = Object.freeze([
  ...['text','muted','subtle'].flatMap(foreground => ['bg','surface','surface-raised'].map(background =>
    ({id:`${foreground}-on-${background}`,foreground:`--${foreground}`,background:`--${background}`,kind:'text'}))),
  ...['bg','surface'].map(background => ({id:`accent-ink-on-${background}`,foreground:'--accent-ink',background:`--${background}`,kind:'text'})),
  ...['accent','accent-hover'].map(background => ({id:`on-accent-on-${background}`,foreground:'--on-accent',background:`--${background}`,kind:'text'})),
  ...['positive-ink','negative-ink','data-gold-ink'].map(foreground => ({id:`${foreground}-on-bg`,foreground:`--${foreground}`,background:'--bg',kind:'text'})),
  ...['icon','icon-muted','focus','accent-ink'].map(foreground => ({id:`${foreground}-icon-on-bg`,foreground:`--${foreground}`,background:'--bg',kind:'icon'})),
].map(Object.freeze));

// Fixed product elements, not arbitrary passing colours. A sample may be
// observed at either required width; every ID must be observed in BOTH themes.
// P1/P2 chart controls retain their density; contrast still applies to them.
export const p0PaintSamples = Object.freeze([
  {id:'page-heading',stage:'chart',selector:'#atlas-page-heading',kind:'text'},
  {id:'instrument-symbol',stage:'chart',selector:'.symbol-selector-label',kind:'text'},
  {id:'chart-indicators',stage:'chart',selector:'#atlas-mode-name',kind:'text'},
  {id:'chart-interval',stage:'chart',selector:'#workbench-interval-select',kind:'text'},
  {id:'chart-scale',stage:'chart',selector:'#workbench-scale',kind:'text'},
  {id:'chart-auto-scale',stage:'chart',selector:'#workbench-auto-scale',kind:'text'},
  {id:'settings-title',stage:'settings',selector:'#chart-reader-title',kind:'text'},
  {id:'theme-toggle',stage:'settings',selector:'[data-atlas-theme-toggle]',kind:'text'},
  {id:'btc-price-axis-basis',symbol:'BTCUSD',stage:'settings',selector:'.price-axis-options > .price-axis-basis',kind:'text'},
  {id:'btc-price-axis-legend',symbol:'BTCUSD',stage:'settings',selector:'.price-axis-options > legend',kind:'text'},
  {id:'btc-invert-label',symbol:'BTCUSD',stage:'settings',selector:'[data-price-axis-option="invert-scale"] + span',kind:'text'},
  {id:'btc-auto-label',symbol:'BTCUSD',stage:'settings',selector:'[data-price-axis-option="price-only-auto"] + span',kind:'text'},
  {id:'eth-settings-note',symbol:'ETHUSD',stage:'settings',selector:'#chart-reader-body > p',kind:'text'},
  {id:'eth-volume-label',symbol:'ETHUSD',stage:'settings',selector:'.native-chart-setting:has([data-native-setting="showVolume"])',kind:'text'},
  {id:'eth-invert-label',symbol:'ETHUSD',stage:'settings',selector:'.native-chart-setting:has([data-native-setting="invertScale"])',kind:'text'},
  {id:'eth-scale-action',symbol:'ETHUSD',stage:'settings',selector:'#chart-reader-body > .native-reader-action:not([data-atlas-theme-toggle])',kind:'text'},
  {id:'chart-type-icon',stage:'chart',selector:'#workbench-chart-type svg path',kind:'icon'},
  {id:'settings-icon',stage:'chart',selector:'#atlas-display-options svg path',kind:'icon'},
  {id:'symbol-chevron-icon',stage:'chart',selector:'.symbol-selector-chevron svg path',kind:'icon'},
  {id:'reader-close-icon',stage:'settings',selector:'.reader-heading button svg path',kind:'icon'},
].map(Object.freeze));

const cssNames = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
const blank = value => value.replace(/[^\n]/g,' ');

/** Balanced declaration inventory. Comments/strings/URLs do not become fake
 * declarations or colours; unsupported/malformed input remains an issue. */
export function p0CssDeclarations(source) {
  const clean = String(source).replace(/\/\*[\s\S]*?\*\//g,blank), declarations = [], blocks = [], issues = [];
  const stack = []; let start = 0, quote = null, parens = 0, brackets = 0, escaped = false;
  function declaration(end) {
    const value = clean.slice(start,end).trim(); if (!value) return;
    const match = value.match(/^(--[\w-]+|-?[a-zA-Z][\w-]*)\s*:\s*([\s\S]*)$/);
    if (match && stack.length) declarations.push({property:match[1],value:match[2].trim(),selector:stack.at(-1).header,
      ancestors:stack.slice(0,-1).map(block => block.header),block:stack.at(-1).id,line:clean.slice(0,start).split('\n').length});
    else if (!value.startsWith('@')) issues.push(`Unparsed declaration at line ${clean.slice(0,start).split('\n').length}: ${value.slice(0,120)}`);
  }
  for (let index = 0; index < clean.length; index++) {
    const char = clean[index];
    if (escaped) {escaped = false;continue;}
    if (quote) {if (char === '\\') escaped = true;else if (char === quote) quote = null;continue;}
    if (char === '"' || char === "'") {quote = char;continue;}
    if (char === '(') {parens++;continue;} if (char === ')') {parens--;continue;}
    if (char === '[') {brackets++;continue;} if (char === ']') {brackets--;continue;}
    if (parens || brackets) continue;
    if (char === '{') {const block = {id:blocks.length,header:clean.slice(start,index).trim()};blocks.push(block);stack.push(block);start = index+1;}
    else if (char === ';') {declaration(index);start = index+1;}
    else if (char === '}') {declaration(index);if (!stack.length) issues.push('Unexpected closing brace');else stack.pop();start = index+1;}
  }
  if (quote || parens || brackets || stack.length || clean.slice(start).trim()) issues.push('Unterminated CSS construct');
  return {declarations,blocks,issues};
}

export function p0ColorLiterals(value) {
  const clean = String(value).replace(/url\(\s*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^)])*\)/gi,'')
    .replace(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'/g,'');
  const literals = [...clean.matchAll(/#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\((?!\s*var\s*\()[^)]*\)/gi)].map(match => match[0]);
  for (const match of clean.matchAll(/(?<![\w-])([a-z]+)(?![\w-])/gi)) if (cssNames.has(match[1].toLowerCase())) literals.push(match[1]);
  return [...new Set(literals)];
}

export function inspectP0CssSources(sources,{canonicalFile='dist/styles.css'}={}) {
  const tokens = new Map(), literalViolations = [], colorRootBlocks = [], issues = [], inventory = [], declarations = [];
  for (const {file,source} of sources) {
    const parsed = p0CssDeclarations(source), allowedBlocks = new Set();
    issues.push(...parsed.issues.map(issue => `${file}: ${issue}`));
    for (const entry of parsed.declarations) {
      const literals = p0ColorLiterals(entry.value), canonical = file === canonicalFile && entry.selector === ':root' && entry.ancestors.length === 0;
      declarations.push({file,...entry,canonical});
      if (canonical && entry.property.startsWith('--')) {
        if (tokens.has(entry.property)) issues.push(`${file}: duplicate root token ${entry.property}`);
        tokens.set(entry.property,entry.value.replace(/\s*!important\s*$/i,''));
      }
      if (!literals.length) continue;
      if (canonical && entry.property.startsWith('--')) allowedBlocks.add(entry.block);
      else literalViolations.push({file,...entry,literals});
    }
    colorRootBlocks.push(...[...allowedBlocks].map(block => ({file,block})));
    inventory.push({file,declarations:parsed.declarations.length,literalDeclarations:parsed.declarations.filter(entry => p0ColorLiterals(entry.value).length).length});
  }
  if (colorRootBlocks.length !== 1) issues.push(`Expected one canonical root colour block, observed ${colorRootBlocks.length}`);
  const rootPaintTokens = inspectP0RootPaintTokens(tokens), paintNames = new Set(rootPaintTokens.rows.map(row => row.name));
  const globalSelector = selector => p0SplitArguments(selector).some(part => /^(?:(?::root|html|body)(?:\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)*|\[data-theme(?:=[^\]]+)?\])$/.test(part));
  const ownedPaintBlock = colorRootBlocks.length === 1 ? colorRootBlocks[0].block : null;
  const globalTokenViolations = declarations.filter(entry => !(entry.canonical && entry.block === ownedPaintBlock) && entry.property.startsWith('--') && globalSelector(entry.selector) &&
    (paintNames.has(entry.property) || [...entry.value.matchAll(/var\(\s*(--[\w-]+)/g)].some(match => paintNames.has(match[1])) || p0ColorLiterals(entry.value).length));
  if (rootPaintTokens.status !== 'passed') issues.push(...rootPaintTokens.rows.filter(row => row.status !== 'passed').map(row => `${row.name}/${row.theme}: ${row.reason}`));
  return {status:literalViolations.length || globalTokenViolations.length || issues.length ? 'failed' : 'passed',inventory,tokens,literalViolations,globalTokenViolations,colorRootBlocks,rootPaintTokens,issues,
    scope:'authored root and apps/web CSS inventory plus inline boot CSS; unchanged third-party Skullet excluded; JS/SVG/brand literals reported separately, not claimed zero'};
}

export function readP0RootTokens(css) {
  const parsed = p0CssDeclarations(css), tokens = new Map();
  if (parsed.issues.length) throw new Error(parsed.issues.join('; '));
  for (const entry of parsed.declarations) if (entry.selector === ':root' && !entry.ancestors.length && entry.property.startsWith('--')) {
    if (tokens.has(entry.property)) throw new Error(`Duplicate root token ${entry.property}`);
    tokens.set(entry.property,entry.value.replace(/\s*!important\s*$/i,''));
  }
  return tokens;
}

export function p0SplitArguments(value) {
  const result = []; let depth = 0, start = 0;
  for (let i = 0; i < value.length; i++) {if (value[i] === '(') depth++;else if (value[i] === ')') depth--;else if (value[i] === ',' && depth === 0) {result.push(value.slice(start,i).trim());start = i+1;}}
  result.push(value.slice(start).trim()); return result;
}

export function p0ParseColor(value) {
  const input = String(value).trim().toLowerCase();
  if (input === 'transparent') return [0,0,0,0];
  if (input === 'white') return [255,255,255,1]; if (input === 'black') return [0,0,0,1];
  const hex = input.match(/^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/);
  if (hex) {const text = hex[1].length < 5 ? [...hex[1]].map(v => v+v).join('') : hex[1];return [0,2,4].map(i => Number.parseInt(text.slice(i,i+2),16)).concat(text.length === 8 ? Number.parseInt(text.slice(6,8),16)/255 : 1);}
  const rgb = input.match(/^rgba?\(([^)]+)\)$/), srgb = input.match(/^color\(srgb\s+([^)]+)\)$/);
  if (rgb || srgb) {
    const values = (rgb || srgb)[1].replace(/\//g,' ').split(/[\s,]+/).filter(Boolean);
    if (values.length < 3 || values.length > 4 || values.some(v => !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)%?$/.test(v))) throw new Error(`Unsupported colour ${value}`);
    const result = values.map((v,i) => Number.parseFloat(v) * (v.endsWith('%') ? i<3 ? 2.55 : .01 : i<3 && srgb ? 255 : 1));
    if (result.length === 3) result.push(1);
    if (result.some((v,i) => !Number.isFinite(v) || v<0 || v>(i<3 ? 255 : 1)+1e-10)) throw new Error(`Out-of-range colour ${value}`);
    return result;
  }
  throw new Error(`Unsupported colour ${value}`);
}

export function resolveP0TokenValue(tokens,name,theme,chain=[]) {
  if (!['light','dark'].includes(theme)) throw new Error(`Unknown theme ${theme}`);
  if (chain.includes(name)) throw new Error(`Cyclic token ${[...chain,name].join(' -> ')}`);
  if (!tokens.has(name)) throw new Error(`Missing root token ${name}`);
  const nextChain = [...chain,name], visited = [...nextChain];
  function expand(value) {
    let result = '', start = 0;
    const pattern = /\b(var|light-dark)\(/g;let match;
    while ((match = pattern.exec(value))) {
      let end = pattern.lastIndex, depth = 1;
      for (;end<value.length && depth;end++) {if (value[end] === '(') depth++;else if (value[end] === ')') depth--;}
      if (depth) throw new Error(`Unclosed token expression ${name}`);
      const args = p0SplitArguments(value.slice(pattern.lastIndex,end-1));let replacement;
      if (match[1] === 'light-dark') {
        if (args.length !== 2) throw new Error(`Invalid light-dark ${name}`);
        replacement = expand(args[theme === 'light' ? 0 : 1]);
      } else if (tokens.has(args[0])) {
        const resolved = resolveP0TokenValue(tokens,args[0],theme,nextChain);replacement = resolved.value;
        for (const item of resolved.chain) if (!visited.includes(item)) visited.push(item);
      } else {
        if (args.length<2) throw new Error(`Missing root token ${args[0]}`);replacement = expand(args.slice(1).join(','));
      }
      result += value.slice(start,match.index)+replacement;start = end;pattern.lastIndex = end;
    }
    return (result+value.slice(start)).trim();
  }
  return {value:expand(tokens.get(name)),chain:visited};
}
export function resolveP0Token(tokens,name,theme,chain=[]) {
  const result = resolveP0TokenValue(tokens,name,theme,chain);return {...result,color:p0ParseColor(result.value)};
}

/** Resolve ALL canonical paint aliases in both schemes. Numeric geometry,
 * font stacks and type-size aliases remain a separately listed inventory. */
export function inspectP0RootPaintTokens(tokens) {
  const rows = [], nonPaint = [];
  for (const [name] of tokens) for (const theme of ['light','dark']) {
    try {
      const resolved = resolveP0TokenValue(tokens,name,theme);
      try {rows.push({name,theme,...resolved,color:p0ParseColor(resolved.value),kind:'color',status:'passed'});}
      catch (error) {
        if (p0ColorLiterals(resolved.value).length) {
          if (/^(?:-?(?:\d|\.)|(?:repeating-)?(?:linear|radial|conic)-gradient\()/i.test(resolved.value)) rows.push({name,theme,...resolved,kind:'composite-paint',status:'passed'});
          else rows.push({name,theme,...resolved,kind:'unsupported-color',status:'unverified',reason:error.message});
        } else nonPaint.push({name,theme,...resolved});
      }
    } catch (error) {rows.push({name,theme,kind:'unresolved-alias',status:'failed',reason:error.message});}
  }
  return {status:rows.every(row => row.status === 'passed') ? 'passed' : 'failed',rows,nonPaint};
}

export function p0Composite(front,back) {
  const alpha = front[3]+back[3]*(1-front[3]);
  if (!alpha) return [0,0,0,0];
  return [0,1,2].map(i => (front[i]*front[3]+back[i]*back[3]*(1-front[3]))/alpha).concat(alpha);
}
export function p0Contrast(foreground,background) {
  const back = typeof background === 'string' ? p0ParseColor(background) : background;
  if (Math.abs(back[3]-1)>1e-10) throw new Error('Contrast background is not proven opaque');
  const front = p0Composite(typeof foreground === 'string' ? p0ParseColor(foreground) : foreground,back);
  const luminance = color => color.slice(0,3).map(v => v/255).map(v => v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
  const a = luminance(front), b = luminance(back);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
export function inspectP0TokenPairs(tokens,pairs=p0TokenPairs) {
  return ['light','dark'].flatMap(theme => pairs.map(pair => {
    try {
      const foreground = resolveP0Token(tokens,pair.foreground,theme), background = resolveP0Token(tokens,pair.background,theme), ratio = p0Contrast(foreground.color,background.color);
      return {...pair,theme,foregroundToken:pair.foreground,backgroundToken:pair.background,foreground,background,ratio,threshold:p0Thresholds[pair.kind],status:ratio>=p0Thresholds[pair.kind] ? 'passed' : 'failed'};
    } catch (error) {return {...pair,theme,status:'unverified',reason:error.message};}
  }));
}

export function validateP0Paint(sample) {
  if (!sample.visible) return {status:'unverified',reason:sample.reason || 'fixed sample is not visibly painted'};
  if (sample.issues?.length) return {status:'unverified',reason:sample.issues.join('; ')};
  try {
    const background = sample.backgrounds.reduceRight((back,value) => p0Composite(p0ParseColor(value),back),[0,0,0,0]);
    const ratio = p0Contrast(sample.foreground,background), threshold = p0Thresholds[sample.kind];
    if (!Number.isFinite(threshold)) throw new Error('Unknown sample kind');
    return {status:ratio>=threshold ? 'passed' : 'failed',ratio,threshold,background};
  } catch (error) {return {status:'unverified',reason:error.message};}
}

export function validateP0PaintRole(sample,tokens,theme) {
  const names = sample.kind === 'icon' ? ['--icon','--icon-muted','--focus','--accent-ink'] : ['--text','--muted','--subtle','--accent-ink','--on-accent'];
  try {
    const actual = p0ParseColor(sample.foreground), expected = names.map(name => ({name,...resolveP0Token(tokens,name,theme)}));
    const matchedRoleTokens = expected.filter(value => value.color.every((channel,i) => Math.abs(channel-actual[i])<1e-6)).map(value => value.name);
    return {status:matchedRoleTokens.length ? 'passed' : 'failed',matchedRoleTokens,expectedRoles:names,
      reason:matchedRoleTokens.length ? null : 'actual UI ink is outside the canonical text/icon role palette; JS/SVG literals are not silently exempted'};
  } catch (error) {return {status:'unverified',matchedRoleTokens:[],expectedRoles:names,reason:error.message};}
}

export function p0SampleCoverage(cases,samples=p0PaintSamples) {
  const rows = ['light','dark'].flatMap(theme => samples.map(sample => {
    const observations = cases.filter(item => !item.fallback && item.theme === theme).flatMap(item =>
      (item.snapshots || []).flatMap(snapshot => (snapshot.samples || []).filter(value => value.id === sample.id && value.visible).map(value => ({caseId:item.id,stage:snapshot.stage,...value,captureId:snapshot.captureId}))));
    const checks = observations.map(value => ({caseId:value.caseId,...validateP0Paint(value)}));
    for (const observation of observations) {
      const owner = cases.find(item => item.id === observation.caseId)?.snapshots?.find(item => item.stage === observation.stage && item.captureId === observation.captureId);
      if (observation.actualSelector && owner?.samples?.some(other => other.visible && other.id !== observation.id && other.actualSelector === observation.actualSelector))
        checks.push({caseId:observation.caseId,status:'failed',reason:'two fixed sample IDs refer to the same painted element'});
    }
    const status = checks.some(item => item.status === 'failed') ? 'failed' : !checks.length || checks.some(item => item.status === 'unverified') ? 'unverified' : 'passed';
    return {id:sample.id,kind:sample.kind,theme,status,observations:checks,reason:checks.length ? null : 'required fixed visible sample was not observed'};
  }));
  return {required:samples.length*2,observed:rows.filter(row => row.observations.length).length,passed:rows.filter(row => row.status === 'passed').length,
    status:rows.every(row => row.status === 'passed') ? 'passed' : rows.some(row => row.status === 'failed') ? 'failed' : 'unverified',rows};
}

export function validateP0Typography(snapshot) {
  const failures = [], body = snapshot.body;
  if (!body || ![15,16,17].includes(body.fontSize)) failures.push('body must use the P0 15/16/17px scale');
  if (!body?.fontFamily?.includes(p0FontFamily)) failures.push('body does not declare the local Pretendard family');
  for (const node of snapshot.prose || []) {
    if (!node.visible) continue;
    if (![15,16,17].includes(node.fontSize)) failures.push(`${node.selector}: P0 prose must use 15/16/17px, got ${node.fontSize}`);
  }
  return {status:failures.length ? 'failed' : 'passed',failures,
    deferredDensity:snapshot.denseText || [],scope:'body and prose; existing chart/navigation controls and numeric axes are recorded for P1/P2, not counted as P0 typography passes'};
}

export function validateP0FontEvidence(evidence,{fallback=false}={}) {
  const failures = [], faces = evidence.faces || [], used = evidence.platformFonts || [], requests = evidence.requests || [];
  const local = requests.filter(request => request.local && /\.woff2(?:[?#]|$)/i.test(request.url));
  const custom = used.filter(font => font.isCustomFont && /pretendard/i.test(`${font.familyName} ${font.postScriptName}`) && font.glyphCount>0);
  if (!evidence.declaredFamily?.includes(p0FontFamily)) failures.push('local font family is absent from the computed stack');
  if (!evidence.text?.trim() || !/[가-힣]/.test(evidence.text) || !evidence.visibleInk) failures.push('visible Korean product text was not observed');
  if (evidence.overflow !== 0) failures.push('font lane has horizontal document overflow');
  if (requests.some(request => !request.local && /(?:\.woff2?(?:[?#]|$)|fonts\.(?:googleapis|gstatic)\.com)/i.test(request.url))) failures.push('font depends on an external request');
  if (fallback) {
    if (!local.some(request => request.blockedForFallback)) failures.push('local font failure was not exercised');
    if (custom.length) failures.push('fallback lane still painted with Pretendard');
    if (!used.some(font => !font.isCustomFont && font.glyphCount>0)) failures.push('actual system fallback glyph owner was not observed');
  } else {
    if (!faces.some(face => face.family.replace(/["']/g,'') === p0FontFamily && face.status === 'loaded')) failures.push('Pretendard FontFaceSet entry did not load');
    if (!local.some(request => request.status>=200 && request.status<300 && !request.blockedForFallback)) failures.push('successful same-origin WOFF2 response was not observed');
    if (!custom.length) failures.push('actual Pretendard glyph owner was not observed');
    if (used.some(font => font.glyphCount>0 && !custom.includes(font))) failures.push('the fixed Korean font sample still contains non-Pretendard glyph owners');
  }
  return {status:failures.length ? 'failed' : 'passed',failures};
}

export function p0FinalStatus(report) {
  const required = p0Cases.length, cases = report.cases || [], missing = p0Cases.filter(spec => !cases.some(item => item.id === spec.id)).map(spec => spec.id);
  const duplicate = cases.length !== new Set(cases.map(item => item.id)).size;
  const exactRows = (rows,inventory) => rows?.length === inventory.length*2 && ['light','dark'].every(theme => inventory.every(spec => rows.filter(row => row.id === spec.id && row.theme === theme && row.status === 'passed').length === 1));
  const sourcePassed = report.sourceAudit?.status === 'passed', tokenPassed = exactRows(report.tokenPairs,p0TokenPairs);
  const coveragePassed = report.sampleCoverage?.status === 'passed' && report.sampleCoverage.required === 40 && report.sampleCoverage.passed === 40 && exactRows(report.sampleCoverage.rows,p0PaintSamples);
  const passed = !missing.length && !duplicate && cases.length === required && cases.every(item => item.status === 'passed') && sourcePassed && tokenPassed && coveragePassed && report.sourceStable === true && !(report.failures || []).length;
  const failed = duplicate || cases.some(item => item.status === 'failed') || report.sourceAudit?.status === 'failed' || report.tokenPairs?.some(item => item.status === 'failed') || report.sampleCoverage?.status === 'failed';
  return {status:passed ? 'passed' : failed ? 'failed' : 'unverified',qualifiesP0Verification:passed,
    counts:{required,attempted:cases.length,passed:cases.filter(item => item.status === 'passed').length,failed:cases.filter(item => item.status === 'failed').length,unattempted:missing.length},missingCases:missing};
}
