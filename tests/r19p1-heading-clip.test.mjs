import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {parseHTML} from 'linkedom';
import {inspectP0TextInk} from '../scripts/ui-renewal-p0-text-hit.mjs';
import {p0CssDeclarations,readP0RootTokens} from '../scripts/ui-renewal-p0-contract.mjs';

// Source/geometry MODEL only. The collector is unchanged, but these explicit
// rectangles are not browser layout, font ink, native hits or a P1 gate receipt.
// The upper title band uses the Mac evidence-320 Range: top20, bottom40.
const css=await readFile(new URL('../dist/ui/shell-layout.css',import.meta.url),'utf8');
const parsed=p0CssDeclarations(css);
assert.deepEqual(parsed.issues,[]);
const tokens=readP0RootTokens(await readFile(new URL('../dist/styles.css',import.meta.url),'utf8'));
const bodySelector='body[data-shell=dashboard]';
const cardSelector='body[data-shell=dashboard] #main > :is(#evidence-view, #ipo-view, #data-view, #market-view, #relay-view, #conference-view)';
const compact=text=>text.replace(/\s+/g,' ').trim();
const declarations=selector=>Object.fromEntries(parsed.declarations.filter(row=>!row.ancestors.length&&compact(row.selector)===selector).map(row=>[row.property,row.value]));
const body=declarations(bodySelector),card=declarations(cardSelector);
const widths=[320,390,768,1440],pages={evidence:'리서치',data:'자산 비교',ipo:'공모주',relay:'릴레이 콘텐츠',conference:'컨퍼런스 복습'};
// Computed shadows serialize the authored unitless zero as an absolute length.
const computedShadow=source=>source.replace(/^0 /,'0px ').replace('var(--shadow-color)','rgba(0, 27, 55, 0.08)');
const rectangle=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const defaults={display:'block',visibility:'visible',opacity:'1',position:'static',color:'rgb(25, 31, 40)',
  backgroundColor:'transparent',backgroundImage:'none',boxShadow:'none',textShadow:'none',outlineWidth:'0px',outlineStyle:'none',
  overflowX:'visible',overflowY:'visible',borderRadius:'0px',content:'none',
  ...Object.fromEntries(['Top','Right','Bottom','Left'].flatMap(side=>[[`border${side}Width`,'0px'],[`border${side}Style`,'none'],[`border${side}Color`,'transparent']]))};

function collect({width=320,page='evidence',collapsed=false,shadow='none',unsupportedClip=false}={}) {
  const {document}=parseHTML(`<html><body data-shell="dashboard"><header id="header"><h1 id="atlas-page-heading">${pages[page]}</h1></header><div id="workspace"><main id="main"><section id="${page}-view"></section></main></div></body></html>`);
  const headerHeight=Number.parseFloat(body['--app-header-height']),gutter=width<768?12:Math.max(24,(width-1280)/2),padding=width<768?12:24;
  assert.equal(headerHeight,112);
  const root=document.documentElement,owner=document.body,header=document.getElementById('header'),heading=document.getElementById('atlas-page-heading');
  const workspace=document.getElementById('workspace'),main=document.getElementById('main'),section=document.getElementById(`${page}-view`);
  const bounds=new Map([[root,rectangle(0,0,width,900)],[owner,rectangle(0,collapsed?headerHeight:0,width,900)],
    [header,rectangle(0,0,width,headerHeight)],[heading,rectangle(gutter,18,pages[page].length*17,24)],
    [workspace,rectangle(0,headerHeight,width,900-headerHeight)],
    [main,rectangle(gutter,headerHeight+padding,width-2*gutter,900-headerHeight-2*padding)],
    [section,rectangle(gutter,headerHeight+padding,width-2*gutter,900-headerHeight-2*padding)]]);
  const styles=new Map([[root,{overflowX:'clip',overflowY:'clip'}],[owner,{overflowX:'clip',overflowY:'clip',display:collapsed?'block':body.display}],
    [header,{position:'fixed'}],[section,{boxShadow:shadow,borderRadius:'16px'}],
    ...(unsupportedClip?[[workspace,{clipPath:'circle(50%)'}]]:[])]);
  for(const [node,box] of bounds) {
    node.getBoundingClientRect=()=>({...box});node.getClientRects=()=>[{...box}];
    for(const [key,value] of Object.entries({clientLeft:0,clientTop:0,clientWidth:box.width,clientHeight:box.height}))Object.defineProperty(node,key,{value});
  }
  document.createRange=()=>{
    let textNode,start=0,end=0;
    return {setStart(node,offset){textNode=node;start=offset;},setEnd(node,offset){assert.equal(node,textNode);end=offset;},
      selectNodeContents(node){textNode=node;start=0;end=node.textContent.length;},
      getClientRects(){assert.equal(textNode,heading.firstChild);return Array.from(textNode.textContent).slice(start,end).map((_,index)=>rectangle(gutter+(start+index)*17,20,17,20));}};
  };
  const globals={document,innerWidth:width,innerHeight:900,CSS:{escape:String},
    getComputedStyle:(node,pseudo)=>({...defaults,...(pseudo?{}:styles.get(node))})};
  return JSON.parse(JSON.stringify(runInNewContext(`(${inspectP0TextInk.toString()})('#atlas-page-heading')`,globals)));
}

test('P1 heading correction is dashboard-only and retains the shared palette and card contract',()=>{
  assert.equal(body.display,'flow-root');
  assert.equal(body['--shell-card-shadow'],'0 2px 8px var(--shadow-color)');
  assert.equal(card['box-shadow'],'var(--shell-card-shadow)');
  assert.equal(card.background,'var(--surface)');assert.equal(card.border,'1px solid var(--border)');
  assert.equal(card['border-radius'],'var(--card-radius-md)');assert.equal(tokens.get('--card-radius-md'),'16px');
  assert.equal(tokens.get('--shadow'),'0 10px 40px var(--shadow-color)');
  assert.equal(tokens.has('--shell-card-shadow'),false,'local card geometry must not replace the P0 root token');
  assert.deepEqual(parsed.declarations.filter(row=>row.property==='--shell-card-shadow').map(row=>[compact(row.selector),row.ancestors]),[[bodySelector,[]]]);
  for(const row of parsed.declarations.filter(row=>row.value==='flow-root'))assert.equal(compact(row.selector),bodySelector);
  assert.equal(body.overflow,undefined);assert.equal(body['clip-path'],undefined);
  assert.equal(card.overflow,undefined);assert.equal(card['clip-path'],undefined,'the IPO disclosure must retain its existing clipping owner');
});

test('negative model: a collapsed body clip rejects the recorded top20–40 title despite its fixed header',()=>{
  const result=collect({collapsed:true});
  assert.equal(result.glyphs.length,3);
  assert.ok(result.glyphs.every(glyph=>glyph.rect.top===20&&glyph.rect.bottom===40));
  assert.ok(result.issues.some(issue=>issue.includes('body')&&issue.includes('text ink is clipped by overflow')),JSON.stringify(result.issues));
});

test('negative model: fixing body origin alone cannot prove the original broad card shadow',()=>{
  const shadow=computedShadow(tokens.get('--shadow'));
  for(const width of widths)for(const page of Object.keys(pages)) {
    const result=collect({width,page,shadow});
    assert.ok(!result.issues.some(issue=>issue.includes('text ink is clipped by overflow')));
    assert.ok(result.issues.includes(`#${page}-view: unsupported box-shadow paint`),`${page}-${width}: ${JSON.stringify(result.issues)}`);
    assert.ok(result.intersections.length>0);
  }
});

for(const width of widths)test(`corrected ${width}px model: contained title and bounded card shadow yield no unsupported paint candidates`,()=>{
  const shadow=computedShadow(body['--shell-card-shadow']);
  for(const page of Object.keys(pages)) {
    const result=collect({width,page,shadow});
    assert.equal(result.text,pages[page]);assert.ok(result.glyphs.length>0);
    assert.ok(result.glyphs.every(glyph=>glyph.rect.top===20&&glyph.rect.bottom===40));
    assert.deepEqual(result.issues,[],`${page}-${width}`);
    assert.deepEqual(result.overlappingPaintCandidates,[]);assert.deepEqual(result.intersections,[]);
  }
});

test('negative model: an unsupported clip remains unverified with the title and old shadow present',()=>{
  const shadow=computedShadow(tokens.get('--shadow'));
  const result=collect({shadow,unsupportedClip:true});
  assert.ok(result.issues.some(issue=>issue.includes('unsupported or missing clipPath rectangle (circle(50%))')));
  assert.ok(result.issues.includes('#evidence-view: unsupported box-shadow paint'));
});
