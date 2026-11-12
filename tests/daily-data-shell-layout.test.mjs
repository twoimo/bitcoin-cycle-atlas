import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {COMPARISON_SYMBOLS} from './helpers/daily-data-view-fixture.mjs';

// Source budget and selector-scope proof, not native table/scrollbar geometry.
// The unchanged ETH gate still measures sticky corners, final-row alignment,
// control paint and cached DOM identity through actual viewport changes.
const {document}=parseHTML('<html><head></head><body data-shell="dashboard" data-page="data" data-shell-width="wide"><div class="workspace"><main id="main"><section id="data-view" class="daily-workspace"><header class="daily-heading"></header><div class="asset-filters"></div><div class="asset-table-summary"></div><div class="asset-context" hidden></div><section class="asset-table-panel"></section></section></main></div></body></html>');
function stylesheet(file) {
  const style=document.createElement('style');style.textContent=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');document.head.append(style);
  return [...style.sheet.cssRules];
}
const daily=stylesheet('daily-data.css'),shell=stylesheet('ui/shell-layout.css'),atlas=stylesheet('atlas-shell.css'),tokens=stylesheet('styles.css'),ledgers=stylesheet('editorial-ledgers.css');
const normalize=selector=>selector?.replace(/["'\s]/g,'');
function find(rules,selector) {
  const found=rules.find(rule=>normalize(rule.selectorText)===normalize(selector));
  assert.ok(found,'missing source rule: '+selector);return found.style;
}
const wide=daily.find(rule=>rule.type===4&&rule.media.mediaText.replace(/\s/g,'')==='(min-width:1280px)');
assert.ok(wide);
const direct='body[data-shell=dashboard][data-page=data]:not([data-embedded=true])';
const workspaceSelector=direct+' .workspace, '+direct+' #root > .workspace';
const wideRules=[...wide.cssRules];
const px=(style,property)=>parseFloat(style.getPropertyValue(property));

function directState(page='data',embedded=false) {
  document.body.dataset.page=page;
  if(embedded)document.body.dataset.embedded='true';else delete document.body.dataset.embedded;
}

test('only the direct data board removes the extra footer gutter and combines its wide toolbar',()=>{
  directState();
  const bottomRule=daily.find(rule=>normalize(rule.selectorText)===normalize(workspaceSelector));
  assert.equal(bottomRule.style.getPropertyValue('padding-bottom'),'var(--content-bottom-height)');
  assert.ok(document.querySelector('.workspace').matches(bottomRule.selectorText));
  const grid=wideRules.find(rule=>rule.style?.getPropertyValue('display')==='grid');
  assert.equal(grid.style.getPropertyValue('grid-template-columns'),'auto minmax(0, 1fr)');
  assert.equal(grid.style.getPropertyValue('grid-template-rows'),'auto auto auto minmax(0, 1fr)');
  assert.ok(document.querySelector('#data-view').matches(grid.selectorText));
  for(const [page,embedded] of [['data',true],['evidence',false],['outlook',false]]) {
    directState(page,embedded);
    assert.equal(document.querySelector('.workspace').matches(bottomRule.selectorText),false);
    assert.equal(document.querySelector('#data-view').matches(grid.selectorText),false);
  }
  directState();
});

test('the original action, filter, summary, status and table owners occupy explicit non-overlapping grid areas',()=>{
  directState();
  const expected=new Map([['daily-heading','actions'],['asset-filters','filters'],['asset-table-summary','summary'],['asset-context','status'],['asset-table-panel','table']]);
  for(const [className,area] of expected) {
    const node=document.querySelector('.'+className),selector=direct+' #data-view > .'+className;
    assert.equal(find(wideRules,selector).getPropertyValue('grid-area'),area);
    assert.ok(node.matches(selector));
  }
  assert.equal(find(daily,'#data-view .asset-filters').getPropertyValue('overflow-x'),'auto','all filters keep their own horizontal scroll owner');
  assert.equal(find(daily,'#data-view .asset-table-scroll').getPropertyValue('overflow'),'auto','table retains both scroll axes');
  const grid=wideRules.find(rule=>rule.style?.getPropertyValue('display')==='grid').style;
  assert.equal(grid.getPropertyValue('grid-template-areas'),'"actions filters" "summary summary" "status status" "table table"','visible loading/error status has its own auto row above the table');
});

test('unchanged row/header minima fit tall boards while the shorter board retains real scrolling',()=>{
  const header=px(find(shell,'body[data-shell=dashboard]'),'--app-header-height');
  const footer=px(atlas.find(rule=>rule.style?.getPropertyValue('--content-bottom-height')).style,'--content-bottom-height');
  const top=px(find(wideRules,workspaceSelector),'padding-top');
  const card=find(shell,'body[data-shell=dashboard] #main > :is(#evidence-view, #ipo-view, #data-view, #market-view, #relay-view, #conference-view)');
  const border=parseFloat(card.getPropertyValue('border'));
  const actions=px(find(daily,'#data-view .daily-heading'),'min-height');
  const filters=find(daily,'#data-view .asset-filters'),filterInset=px(filters,'padding');
  const input=px(find(daily,'#data-view .asset-filters input, #data-view .asset-filters select'),'min-height');
  const summary=find(daily,'#data-view .asset-table-summary'),summaryFont=summary.getPropertyValue('font').match(/^(\d+)px\/([\d.]+)/);
  const summaryInsets=summary.getPropertyValue('padding').split(/\s+/).map(parseFloat);
  const summaryBottom=px(find(wideRules,direct+' #data-view > .asset-table-summary'),'padding-bottom');
  const summaryHeight=Number(summaryFont[1])*Number(summaryFont[2])+summaryInsets[0]+summaryBottom+parseFloat(summary.getPropertyValue('border-bottom'));
  const rowHeight=px(find(daily,'#data-view .asset-comparison-table th, #data-view .asset-comparison-table td'),'height');
  const tableHeader=px(find(daily,'#data-view .asset-comparison-table thead th'),'height');
  assert.equal(rowHeight,40);assert.equal(tableHeader,54);assert.equal(COMPARISON_SYMBOLS.length,20);
  assert.equal(find(ledgers,'#data-view .asset-table-panel').getPropertyValue('border-bottom'),'0');
  const minimum=COMPARISON_SYMBOLS.length*rowHeight+tableHeader;
  const viewport=height=>height-header-footer-top-2*border-Math.max(actions,input+2*filterInset)-summaryHeight;
  assert.ok(viewport(1100)>=minimum+8,'1100px tall board needs headroom above the unchanged twenty-row minimum');
  assert.ok(viewport(1008)<minimum-1,'1008px board must keep internal vertical scrolling');
  const tallRow=(viewport(1440)-tableHeader)/COMPARISON_SYMBOLS.length;
  assert.ok(tallRow>=rowHeight&&tallRow<=64,'1440px table fills within the existing bounded row allocation');
});

test('the wide table fits its retained 1280px container without losing any columns',()=>{
  const container=px(tokens.find(rule=>rule.style?.getPropertyValue('--shell-container-wide')).style,'--shell-container-wide');
  const minWidth=px(find(daily,'#data-view .asset-comparison-table'),'min-width');
  const columns=['group','category','name','samples','return','return','price','price','ytd','judgment'];
  const columnTotal=columns.reduce((sum,name)=>sum+px(find(daily,'#data-view .asset-col-'+name),'width'),0);
  assert.equal(container,1280);
  assert.ok(container-2>=minWidth);
  assert.ok(container-2>=columnTotal);
  assert.equal(columns.length,10);
});
