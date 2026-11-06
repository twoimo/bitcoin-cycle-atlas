import assert from 'node:assert/strict';

const coreRoutes = [
  {name:'btc',path:'?symbol=BTCUSD&granularity=daily&type=line'},
  {name:'eth',path:'?symbol=ETHUSD&granularity=daily&type=line'},
  {name:'bmnr',path:'?symbol=BMNR&granularity=daily&type=line'},
  {name:'mstr',path:'?symbol=MSTR&granularity=daily&type=line'},
  {name:'data',path:'?page=data'},
  {name:'evidence',path:'?page=evidence'},
  {name:'compare',path:'?page=compare&legacy=1'},
  {name:'mobile-preview',path:'mobile-preview.html'},
];
const workspaceRoutes = [
  {name:'market-us',path:'market-lab/',center:'market-us',probe:'diagnosis',region:'us'},
  {name:'market-kr',path:'market-lab/?region=kr',center:'market-kr',probe:'diagnosis',region:'kr'},
  {name:'scenario',path:'market-lab/?view=scenario',center:'scenario',probe:'scenario'},
  {name:'cashflow',path:'market-lab/?view=cashflow',center:'cashflow',probe:'cashflow'},
  {name:'rsi',path:'market-lab/charts/?symbol=TQQQ',center:'rsi',probe:'rsi',symbol:'TQQQ'},
  {name:'housing',path:'market-lab/charts/?symbol=HOUSING-SEOUL&region=seoul',center:'housing',probe:'housing',symbol:'HOUSING-SEOUL'},
  {name:'themes',path:'market-lab/charts/?symbol=HYPE',center:'themes',probe:'themes',symbol:'HYPE'},
  {name:'ipo',path:'?page=outlook&center=ipo',center:'ipo',probe:'ipo'},
  {name:'embedded-data',path:'?page=outlook&center=data',center:'data',probe:'data'},
  {name:'research',path:'?page=outlook&center=evidence',center:'evidence',probe:'evidence'},
];
const scopes = Object.freeze({
  core:Object.freeze({name:'core',baselineCommit:'0c1ed40e1b9b6c76f5621d087737dc57f174b51e',baselineCss:24,baselineHtml:2,baselineAssets:18,
    routes:Object.freeze(coreRoutes.map(route=>Object.freeze(route)))}),
  workspaces:Object.freeze({name:'workspaces',baselineCommit:'3b6373906dbdd3ef321db31deaf8a8f785da61c3',baselineCss:32,baselineHtml:12,baselineAssets:20,
    routes:Object.freeze(workspaceRoutes.map(route=>Object.freeze(route)))}),
});

export function hallmarkAuditScope(name='core') {
  assert.ok(Object.hasOwn(scopes,name),'Unknown Hallmark audit suite: '+name);
  return scopes[name];
}

export function countHallmarkSources(files){
  return {css:files.filter(path=>path.endsWith('.css')).length,html:files.filter(path=>path.endsWith('.html')).length};
}

export function verifyHallmarkSourceScope(baselineFiles,currentFiles){
  const baseline=countHallmarkSources(baselineFiles),current=countHallmarkSources(currentFiles);
  assert.deepEqual(baseline,{css:24,html:2},'Pinned baseline inventory changed');
  const currentPaths=new Set(currentFiles);
  const required=baselineFiles.filter(path=>path.endsWith('.css')||path.endsWith('.html'));
  const missing=required.filter(path=>!currentPaths.has(path));
  assert.deepEqual(missing,[],'Current source must keep every baseline screen/style path: '+missing.join(', '));
  return {baseline,current,preservedBaselinePaths:required};
}

export function verifyHallmarkWorkspaceSourceScope(baselineFiles,currentFiles){
  const baseline=countHallmarkSources(baselineFiles),current=countHallmarkSources(currentFiles);
  assert.deepEqual(baseline,{css:32,html:12},'Pinned workspace baseline inventory changed');
  // Vite names its compiled stylesheet by content hash. Keep all stable source
  // owners and entry documents; require a compiled stylesheet in the same owner.
  // The renderer must then load the exact bundle referenced by each document.
  const generatedCss=path=>/^market-lab\/app\/assets\/[^/]+\.css$/.test(path);
  const required=baselineFiles.filter(path=>(path.endsWith('.css')||path.endsWith('.html'))&&!generatedCss(path));
  const currentPaths=new Set(currentFiles),missing=required.filter(path=>!currentPaths.has(path));
  assert.deepEqual(missing,[],'Current workspace source must keep every stable baseline screen/style path: '+missing.join(', '));
  const baselineBundles=baselineFiles.filter(generatedCss),currentBundles=currentFiles.filter(generatedCss);
  assert.equal(baselineBundles.length,1,'Pinned workspace baseline must own its compiled stylesheet');
  assert.ok(currentBundles.length>=baselineBundles.length,'Current workspace must retain a compiled stylesheet in market-lab/app/assets');
  return {baseline,current,preservedBaselinePaths:required,generatedStylesheets:{baseline:baselineBundles,current:currentBundles}};
}

export function hallmarkRequestPath(pathname,base='/bitcoin-cycle-atlas/'){
  if(!pathname.startsWith(base))return null;
  let path;try{path=decodeURIComponent(pathname.slice(base.length));}catch{return null;}
  if(path.startsWith('/')||/[\\\0]/.test(path)||path.split('/').some(part=>part==='.'||part==='..'))return null;
  return !path||path.endsWith('/')?path+'index.html':path;
}

// Self-contained so the identical predicate can run in both the preflight and
// Hallmark's actual browser page. It observes the real host and iframe; it never
// injects data, changes UI state or substitutes a synthetic success document.
export function hallmarkWorkspaceReady(route,expectedSymbols,version){
  if(!route||!['diagnosis','scenario','cashflow','rsi','housing','themes','ipo','data','evidence'].includes(route.probe))throw new Error('Unsupported workspace readiness route');
  if(!Array.isArray(expectedSymbols)||!expectedSymbols.length||expectedSymbols[0]!=='BTC'||new Set(expectedSymbols).size!==expectedSymbols.length)throw new Error('Workspace readiness requires the exact snapshot asset identities');
  if(!['baseline','current'].includes(version))throw new Error('Workspace readiness requires the explicit baseline/current contract');
  if(document.documentElement.dataset.boot!=='ready'||document.body.dataset.centerTool!==route.center)return false;
  const heading=document.querySelector('.atlas-canvas-heading'),frames=[...document.querySelectorAll('.atlas-center-frame:not([hidden])')];
  if(!heading||frames.length!==1)return false;
  const frame=frames[0],bounds=frame.getBoundingClientRect(),headingBounds=heading.getBoundingClientRect();
  if(bounds.width<=0||bounds.height<=0||headingBounds.width<=0||headingBounds.height<=0)return false;
  const doc=frame.contentDocument;
  if(!doc||doc.readyState!=='complete'||doc.URL!==frame.src)return false;
  const source=new URL(frame.src),root=document.querySelector('meta[name="atlas-root"]')?.getAttribute('content')||'/bitcoin-cycle-atlas/';
  if(source.origin!==location.origin||!source.pathname.startsWith(root)||source.searchParams.get('embedded')!=='1')return false;
  const painted=node=>{if(!node||node.hidden)return false;const box=node.getBoundingClientRect();return box.width>0&&box.height>0;};
  const path=selector=>{const node=doc.querySelector(selector);return (node?.getAttribute('d')||'').length>20&&painted(node.closest('svg'));};
  const svg=selector=>painted(doc.querySelector(selector));
  let toolbar=null;
  if(version==='current'){
    const key=['data','ipo','evidence'].includes(route.center)?route.center:'lab';
    const owner=document.getElementById('atlas-center-toolbar-'+key);
    if(!painted(owner)||!heading.contains(owner)||owner.dataset.page!==route.center||frame.dataset.toolbarId!==owner.id)return false;
    const controls=[...owner.querySelectorAll('button,input,select')].filter(painted);
    if(!controls.length)return false;
    toolbar={id:owner.id,controls:controls.length};
  }
  if(['data','ipo','evidence'].includes(route.probe)&&source.searchParams.get('page')!==route.center)return false;
  let content;
  if(route.probe==='diagnosis'){
    if(source.searchParams.get('lab-tab')!=='diagnosis'||source.searchParams.get('lab-region')!==route.region)return false;
    const chart=doc.querySelector('[data-ztd-chart="observed"]');
    const observations=Number(chart?.dataset.sourceCount);
    if(!(observations>0)||!painted(chart.querySelector('svg')))return false;
    content={observations,region:route.region};
  }else if(route.probe==='scenario'){
    if(!svg('[data-ztd-chart="contributions"] svg')||doc.querySelectorAll('#ml-scenario-output tbody tr').length!==3)return false;
    content={contributions:3};
  }else if(route.probe==='cashflow'){
    // The initial empty calculator is the real product state. Do not fill an
    // example to make a screenshot look populated or call missing data success.
    if(doc.querySelectorAll('#ml-economics-form input[data-econ]').length!==6||!doc.querySelector('#ml-economics-output .ml-empty-copy')?.textContent.trim())return false;
    content={state:'empty-input',fields:6};
  }else if(route.probe==='rsi'){
    if(source.searchParams.get('symbol')!==route.symbol||!path('.rsi-price-line'))return false;
    content={symbol:route.symbol,observedPricePath:true};
  }else if(route.probe==='housing'){
    if(source.searchParams.get('symbol')!==route.symbol||!path('.housing-price'))return false;
    content={symbol:route.symbol,observedPricePath:true};
  }else if(route.probe==='themes'){
    if(source.searchParams.get('symbol')!==route.symbol||!svg('.theme-price-chart svg'))return false;
    const candles=doc.querySelectorAll('.theme-price-chart svg g.theme-up rect,.theme-price-chart svg g.theme-down rect').length;
    if(!candles&&!path('.theme-price-line'))return false;
    content={symbol:route.symbol,candles,observedPricePath:path('.theme-price-line')};
  }else if(route.probe==='ipo'){
    if(doc.documentElement.dataset.boot!=='ready'||doc.querySelector('.ipo-pages[aria-busy="true"]')||!svg('.ipo-month-grid [data-ipo-date]'))return false;
    if(!/\d{4}-\d{2}-\d{2}/.test(doc.querySelector('.ipo-source')?.textContent||''))return false;
    const months=[...doc.querySelectorAll('[data-ipo-month]')].map(node=>node.dataset.ipoMonth);
    if(!months.length)return false;
    content={months};
  }else if(route.probe==='data'){
    if(doc.documentElement.dataset.boot!=='ready')return false;
    const symbols=[...doc.querySelectorAll('#data-body tr[data-asset-symbol]')].map(row=>row.dataset.assetSymbol);
    if(symbols[0]!=='BTC'||symbols.length!==expectedSymbols.length||new Set(symbols).size!==expectedSymbols.length||!expectedSymbols.every(symbol=>symbols.includes(symbol)))return false;
    content={symbols};
  }else if(route.probe==='evidence'){
    if(doc.documentElement.dataset.boot!=='ready')return false;
    const records=doc.querySelectorAll('#evidence-body [data-evidence-detail]').length;
    if(!records)return false;
    content={records};
  }
  return {center:route.center,version,frameUrl:source.href,frameWidth:bounds.width,frameHeight:bounds.height,toolbar,content};
}

export function adaptHallmarkWorkspaceReadiness(source){
  const anchor="        if (process.env.HALLMARK_ATLAS_READY === '1') {";
  assert.equal(source.split(anchor).length-1,1,'Workspace readiness adapter anchor must occur exactly once');
  const branch=`        if (process.env.HALLMARK_ATLAS_READY === '1' && process.env.HALLMARK_ATLAS_SUITE === 'workspaces') {
          if (!isUrl(file)) throw new Error('Workspace readiness requires an HTTP URL');
          const atlasRoutes = JSON.parse(process.env.HALLMARK_ATLAS_ROUTES || 'null');
          if (!Array.isArray(atlasRoutes) || atlasRoutes.length !== 10) throw new Error('All ten workspace routes are required');
          const atlasWorkspace = atlasRoutes.find(route => route.url === file);
          if (!atlasWorkspace) throw new Error('Unsupported Atlas workspace readiness route: ' + file);
          const atlasAssetSymbols = JSON.parse(process.env.HALLMARK_ATLAS_ASSET_SYMBOLS || 'null');
          const atlasReady = await page.waitForFunction(${hallmarkWorkspaceReady.toString()}, { timeout: 30000 }, atlasWorkspace, atlasAssetSymbols, process.env.HALLMARK_ATLAS_VERSION);
          const workspace = await atlasReady.jsonValue();
          await atlasReady.dispose();
          console.error('HALLMARK_RENDER_READY ' + JSON.stringify({ url: file, route: atlasWorkspace.name, workspace }));
        } else if (process.env.HALLMARK_ATLAS_READY === '1') {`;
  return source.replace(anchor,branch);
}
