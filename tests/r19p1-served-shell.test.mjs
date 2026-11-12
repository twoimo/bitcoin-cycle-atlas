import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {atlasPages,atlasNavigationPages} from '../dist/atlas-navigation.js';
import {SITE_STYLE_GROUPS} from '../scripts/build-site-styles.mjs';
import {p0CssDeclarations,p0SplitArguments,readP0RootTokens} from '../scripts/ui-renewal-p0-contract.mjs';

// Source/cascade regression only: these fixtures never claim browser paint,
// viewport geometry, pointer reach or a native P1 pass.
const dist=new URL('../dist/',import.meta.url),origin='https://atlas.invalid',base='/bitcoin-cycle-atlas/';
const read=file=>readFile(new URL(file,dist),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const rootHtml=await read('index.html'),p1Css=await read('ui/shell-layout.css');
const tokens=readP0RootTokens(await read('styles.css'));
const corners=['border-top-left-radius','border-top-right-radius','border-bottom-right-radius','border-bottom-left-radius'];
const properties=new Set(['width','height','min-width','min-height','border-radius',...corners,'all']);
const priorityCompare=(a,b)=>{const first=a.findIndex((value,index)=>value!==b[index]);return first<0?0:a[first]-b[first];};
const parsedSheets=new Map();

async function servedStyles(route,html) {
  const {document}=parseHTML(html),root=parseHTML(rootHtml).document;
  const links=[...document.querySelectorAll('link[rel=stylesheet]:not(#atlas-optional-fonts)')];
  const rootLinks=[...root.querySelectorAll('link[rel=stylesheet]:not(#atlas-optional-fonts)')];
  const urls=links.map(n=>new URL(n.getAttribute('href'),origin+base+route));
  assert.deepEqual(urls.map(url=>url.origin+url.pathname),SITE_STYLE_GROUPS.map(group=>origin+base+group.file),
    `${route}: the served entry must load the complete current four-sheet cascade`);
  const prefix='../'.repeat(route.split('/').filter(Boolean).length),sheets=[];
  for(const [index,url] of urls.entries()) {
    const file=SITE_STYLE_GROUPS[index].file,css=await read(file),href=links[index].getAttribute('href');
    assert.equal(href,prefix+rootLinks[index].getAttribute('href').slice(2),`${route}: ${file} must retain its rewritten root link`);
    assert.equal(url.searchParams.get('v'),hash(css).slice(0,12),`${route}: ${file} must identify its current served bytes`);
    sheets.push({file,css});
  }
  const after=sheets.find(sheet=>sheet.file==='site-after-shell.css');
  assert.ok(after.css.includes(`/* Source: ui/shell-layout.css; SHA-256: ${hash(p1Css)} */\n${p1Css}`),
    `${route}: the served final stylesheet must contain the exact P1 shell source`);
  return sheets;
}

function specificity(selector) {
  const score=[0,0,0];let rest='';
  for(let index=0;index<selector.length;) {
    const functional=/^:(is|not|has|where)\(/.exec(selector.slice(index));
    if(!functional){rest+=selector[index++];continue;}
    const start=index+functional[0].length;let end=start,depth=1;
    for(;end<selector.length&&depth;end++){if(selector[end]==='(')depth++;else if(selector[end]===')')depth--;}
    assert.equal(depth,0,`unclosed selector: ${selector}`);
    if(functional[1]!=='where') {
      const best=p0SplitArguments(selector.slice(start,end-1)).map(specificity).sort(priorityCompare).at(-1);
      best.forEach((value,i)=>score[i]+=value);
    }
    index=end;
  }
  rest=rest.replace(/\[[^\]]+\]/g,()=>{score[1]++;return '';});
  rest=rest.replace(/#[\w-]+/g,()=>{score[0]++;return '';});
  rest=rest.replace(/\.[\w-]+|:[\w-]+/g,()=>{score[1]++;return '';});
  rest=rest.replace(/[a-zA-Z][\w-]*/g,()=>{score[2]++;return '';});
  assert.match(rest,/^[\s>+~*]*$/,`unmodelled matching selector: ${selector}`);
  return score;
}
function mediaApplies(ancestors,width) {
  return ancestors.every(condition=>{
    assert.ok(condition.startsWith('@media'),`unmodelled matching condition: ${condition}`);
    return p0SplitArguments(condition.slice(6)).some(branch=>branch.split(/\s+and\s+/).every(part=>{
      const text=part.replace(/\s+/g,''),size=/^\((min|max)-width:(\d+)px\)$/.exec(text);
      if(size)return size[1]==='min'?width>=Number(size[2]):width<=Number(size[2]);
      if(text==='(pointer:coarse)'||text==='(prefers-reduced-motion:reduce)')return false;
      if(text==='(pointer:fine)'||text==='(prefers-reduced-motion:no-preference)')return true;
      assert.fail(`unmodelled matching media query: ${part}`);
    }));
  });
}
function declarations(sheets) {
  return sheets.flatMap(({file,css})=>{
    if(!parsedSheets.has(css)){
      const parsed=p0CssDeclarations(css);assert.deepEqual(parsed.issues,[],file);
      parsedSheets.set(css,parsed.declarations.filter(row=>properties.has(row.property)));
    }
    return parsedSheets.get(css).map(row=>({...row,file}));
  });
}
function navNodes({phone=false,tag='button'}={}) {
  const {document}=parseHTML(`<html><body data-shell="chart" data-page="outlook" data-center-tool="market-us"><aside class="workbench-rail" data-shell-region="right"${phone?' data-mobile-open="true"':''}><nav class="atlas-nav">${atlasNavigationPages.map(page=>`<${tag} data-atlas-page="${page.id}"${page.id==='market-us'?' class="active" aria-current="page"':''}>${page.label}</${tag}>`).join('')}</nav></aside></body></html>`);
  return [...document.querySelectorAll('.atlas-nav > *')];
}
function cascade(rows,node,width) {
  const winners=new Map();
  for(const [order,row] of rows.entries())for(const selector of p0SplitArguments(row.selector)) {
    // The fixture is unfocused and not fullscreen. Substitute only these
    // unsupported states with absent attributes, retaining :not()/list semantics.
    const matchSelector=selector.replace(/:(focus-visible|focus-within|fullscreen)\b/g,'[data-model-$1]');
    if(/::|:(?:before|after|first-letter|first-line)\b/.test(selector)||!node.matches(matchSelector)||!mediaApplies(row.ancestors,width))continue;
    assert.notEqual(row.property,'all','a matching all reset requires explicit cascade support');
    const important=/!important\s*$/i.test(row.value),raw=row.value.replace(/\s*!important\s*$/i,'');
    const value=raw.replace(/var\((--[\w-]+)\)/g,(_,token)=>{assert.ok(tokens.has(token),token);return tokens.get(token);});
    const priority=[Number(important),...specificity(selector),order];
    for(const property of row.property==='border-radius'?corners:[row.property]) {
      if(!winners.has(property)||priorityCompare(priority,winners.get(property).priority)>0)winners.set(property,{value,priority,selector,file:row.file});
    }
  }
  return winners;
}

test('all nine generated outer entries preserve exact root HTML with only their documented path/meta rewrite',async()=>{
  const routes=['market-lab/','market-lab/charts/',...atlasPages.filter(page=>page.tab).map(page=>page.href.slice(1))];
  assert.equal(routes.length,9);assert.equal(new Set(routes).size,9);
  for(const route of routes) {
    const prefix='../'.repeat(route.split('/').filter(Boolean).length);
    const expected=rootHtml.replace(/\b(src|href)=(['"])([^'"]*)\2/g,(all,key,quote,value)=>{
      const next=value.startsWith('./')?prefix+value.slice(2):value.startsWith('?')?prefix+value:value;
      return `${key}=${quote}${next}${quote}`;
    }).replace('<head>',`<head><meta name="atlas-root" content="${base}">`);
    assert.equal(await read(route+'index.html'),expected,`${route}: stale generated outer entry`);
  }
});

for(const route of ['market-lab/','market-lab/us/']) {
  test(`${route} serves the current four stylesheet paths, digests and P1 source`,async()=>{
    await servedStyles(route,await read(route+'index.html'));
  });
  test(`${route} CSS cascade gives all seven 768/1440 nav items 999px corners without changing 44px controls`,async()=>{
    const sheets=await servedStyles(route,await read(route+'index.html')),rows=declarations(sheets);
    for(const width of [768,1440])for(const tag of ['button','a']) {
      const nodes=navNodes({tag});assert.equal(nodes.length,7);
      for(const node of nodes) {
        const winners=cascade(rows,node,width),label=`${route} ${width} ${tag} ${node.dataset.atlasPage}`;
        for(const corner of corners)assert.equal(winners.get(corner)?.value,'999px',`${label} ${corner}`);
        for(const property of ['width','height','min-height'])assert.equal(winners.get(property)?.value,'44px',`${label} ${property}`);
      }
    }
  });
}
test('omitting the served P1 source reproduces the seven 768px 4px corners and cannot pass this contract',async()=>{
  const sheets=await servedStyles('market-lab/',await read('market-lab/index.html'));
  const before=declarations(sheets.map(sheet=>({...sheet,css:sheet.css.replace(p1Css,'')})));
  for(const node of navNodes()) {
    const winners=cascade(before,node,768);
    assert.equal(winners.get('height').value,'44px');
    for(const corner of corners)assert.equal(winners.get(corner).value,'4px');
  }
});
test('P1 nav paint preserves the existing 320/390 phone control geometry and exact current-role markup',async()=>{
  const sheets=await servedStyles('market-lab/',await read('market-lab/index.html')),after=declarations(sheets);
  const before=declarations(sheets.map(sheet=>({...sheet,css:sheet.css.replace(p1Css,'')})));
  for(const width of [320,390])for(const tag of ['button','a'])for(const node of navNodes({phone:true,tag})) {
    const original=cascade(before,node,width),updated=cascade(after,node,width);
    for(const property of ['width','height','min-width','min-height'])assert.equal(updated.get(property)?.value,original.get(property)?.value,`${width} ${tag} ${property}`);
    for(const corner of corners)assert.equal(updated.get(corner)?.value,'999px');
    assert.equal(node.getAttribute('aria-current'),node.dataset.atlasPage==='market-us'?'page':null);
  }
});
test('a late important radius override wins the model and is rejected instead of trusting the earlier P1 rule',async()=>{
  const sheets=await servedStyles('market-lab/',await read('market-lab/index.html'));
  const injected=declarations([...sheets,{file:'regression fixture',css:'.workbench-rail .atlas-nav :is(a, button){border-radius:4px!important}'}]);
  for(const node of navNodes())for(const corner of corners)assert.equal(cascade(injected,node,768).get(corner).value,'4px');
});
