import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {parseHTML} from 'linkedom';
import {mountPageDescription} from '../dist/ui/page-description.js';

// Source/DOM regressions only. Native rectangles, font paint and actual row
// counts remain the responsibility of the unchanged ETH and responsive gates.
function stylesheet(document, file) {
  const style=document.createElement('style');
  style.textContent=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
  document.head.append(style);
  return [...style.sheet.cssRules];
}
const normalized=selector=>selector?.replace(/["'\s]/g,'');

function ownLayout(rules, node, width) {
  const result={};
  for(const rule of rules) {
    if(rule.type===4) {
      // chart-chrome owns only this desktop flow boundary. Do not turn an
      // unfamiliar media condition into a fabricated computed-style result.
      assert.equal(rule.media.mediaText.replace(/\s/g,''),'(min-width:621px)');
      if(width>=621)Object.assign(result,ownLayout([...rule.cssRules],node,width));
      continue;
    }
    const values={};
    for(const key of ['box-sizing','border','border-radius','padding-top','position','inset','width','max-width']) {
      const value=rule.style?.getPropertyValue(key);
      if(value)values[key]=value;
    }
    // A pseudo-element is not one of these three DOM layout owners. Paint and
    // focus-only rules have no declarations in this allocation proof either.
    if(!Object.keys(values).length||!rule.selectorText||rule.selectorText.includes('::')||!node.matches(rule.selectorText))continue;
    Object.assign(result,values);
  }
  return result;
}

function chartFixture(native) {
  const card=native
    ? '<main id="main" class="native-chart-workbench"><header class="atlas-canvas-heading"></header><div id="plot" class="atlas-plot"></div></main>'
    : '<main id="main"><section id="outlook-view"><div class="atlas-workbench"><div class="atlas-chart-stage"><header class="atlas-canvas-heading"></header><div id="plot" class="atlas-plot"></div></div></div></section></main>';
  const {document}=parseHTML('<html><head></head><body data-shell="chart" data-page="outlook"><header class="atlas-dashboard-header"><h1></h1></header><div class="workspace atlas-details-layout '+(native?'native-chart-workspace':'')+'">'+card+'</div></body></html>');
  const heading=document.querySelector('.atlas-canvas-heading');
  const context=mountPageDescription(document,{header:document.querySelector('.atlas-dashboard-header'),heading:document.querySelector('h1')});
  return {document,heading,context,main:document.querySelector('#main'),card:document.querySelector(native?'#main':'.atlas-chart-stage')};
}

for(const [width,native] of [[320,false],[1440,false],[900,false],[320,true],[1440,true]]) {
  test(`the ${native?'native':'BTC'} card and toolbar keep their flow through center entry and return at ${width}px`,t=>{
    const f=chartFixture(native);t.after(()=>f.context.destroy());
    const rules=stylesheet(f.document,'chart-chrome.css');
    const nodes=[f.card,f.main,f.heading],before=nodes.map(node=>ownLayout(rules,node,width));
    assert.equal(before[0].border,'1px solid var(--border)');
    if(width>=621) {
      assert.equal(parseFloat(before[1]['padding-top']),0);
      assert.equal(before[2].position,'relative');
      assert.equal(before[2].inset,'auto');
      assert.equal(before[2].width,'100%');
    }
    const parent=f.heading.parentElement,intro=f.heading.nextElementSibling,title=f.document.querySelector('h1');
    for(const page of ['data','evidence','ipo','rsi',null]) {
      if(page)f.document.body.dataset.centerTool=page;else delete f.document.body.dataset.centerTool;
      f.context.sync();
      assert.deepEqual(nodes.map(node=>ownLayout(rules,node,width)),before,'center ownership cannot remove the card border or restore a fixed toolbar');
      assert.equal(f.heading.parentElement,parent);
      assert.equal(f.heading.nextElementSibling,intro,'the existing normal-flow title stays beside its toolbar');
      assert.equal(intro.dataset.headingPlacement,'label');
      assert.equal(f.document.querySelectorAll('h1').length,1);
      assert.equal(f.document.querySelector('h1'),title);
    }
    f.document.body.dataset.page='compare';
    assert.equal(ownLayout(rules,f.card,width).border,undefined,'the existing comparison layout owns its own frame');
    f.document.body.dataset.shell='dashboard';
    assert.equal(ownLayout(rules,f.heading,width).position,undefined,'content headers keep the accepted P1 layout');
  });
}

function findRule(rules, selector, media=null) {
  const candidates=media
    ? rules.filter(rule=>rule.type===4&&rule.media.mediaText.replace(/\s/g,'')===media).flatMap(rule=>[...rule.cssRules])
    : rules;
  const found=candidates.find(rule=>normalized(rule.selectorText)===normalized(selector));
  assert.ok(found,'missing authored layout rule: '+selector);
  return found.style;
}

test('direct research removes duplicated vertical insets without affecting the embedded toolbar owner',()=>{
  const {document}=parseHTML('<html><head></head><body data-shell="dashboard" data-page="evidence"><section id="evidence-view"><div class="evidence-controls"></div></section></body></html>');
  const rules=stylesheet(document,'research-reader.css'),view=document.querySelector('#evidence-view'),controls=document.querySelector('.evidence-controls');
  const insetRule=rules.find(rule=>rule.style?.getPropertyValue('padding-block')==='8px');
  const controlsRule=rules.find(rule=>rule.selectorText?.includes('.evidence-controls')&&parseFloat(rule.style?.getPropertyValue('margin-bottom'))===0);
  assert.ok(insetRule&&controlsRule);
  assert.ok(view.matches(insetRule.selectorText));assert.ok(controls.matches(controlsRule.selectorText));
  assert.equal(insetRule.style.getPropertyValue('overflow'),'auto','the short card owns real scrolling for its complete row and pager');
  assert.match(insetRule.style.getPropertyValue('grid-template-rows'),/^auto minmax\(var\(--evidence-table-min-height,/,'the measured row minimum belongs to the grid track so the pager follows the row without overlap');
  // Two independent scoping attributes outrank atlas-shell's direct-route
  // physical padding and margin shorthand, even though that file loads later.
  assert.match(normalized(insetRule.selectorText),/\[data-shell=dashboard\]\[data-page=evidence\]/);
  assert.match(normalized(controlsRule.selectorText),/\[data-shell=dashboard\]\[data-page=evidence\]/);
  document.body.dataset.embedded='true';
  assert.equal(view.matches(insetRule.selectorText),false);
  assert.equal(controls.matches(controlsRule.selectorText),false);
  delete document.body.dataset.embedded;document.body.dataset.page='ipo';
  assert.equal(view.matches(insetRule.selectorText),false);
  assert.equal(controls.matches(controlsRule.selectorText),false);
});

test('the source allocation leaves a useful research table with the normal BTC status row present',()=>{
  const {document}=parseHTML('<html><head></head><body></body></html>');
  const shell=stylesheet(document,'ui/shell-layout.css'),atlas=stylesheet(document,'atlas-shell.css'),research=stylesheet(document,'research-reader.css'),viewport=stylesheet(document,'viewport.css'),base=stylesheet(document,'styles.css');
  const header=parseFloat(findRule(shell,'body[data-shell=dashboard]').getPropertyValue('--app-header-height'));
  const footer=parseFloat(atlas.find(rule=>rule.style?.getPropertyValue('--content-bottom-height')).style.getPropertyValue('--content-bottom-height'));
  const cardInset=parseFloat(research.find(rule=>rule.style?.getPropertyValue('padding-block')==='8px').style.getPropertyValue('padding-block'));
  const pager=parseFloat(findRule(viewport,'.evidence-pagination').getPropertyValue('min-height'));
  const gap=parseFloat(findRule(viewport,'#evidence-view').getPropertyValue('gap'));
  const normalButton=parseFloat(findRule(base,'.btc-refresh-notice button').getPropertyValue('min-height'));
  const touchButton=parseFloat(findRule(base,'.btc-refresh-notice button','(max-width:620px)').getPropertyValue('min-height'));
  const controlMin=parseFloat(base.find(rule=>rule.style?.getPropertyValue('--control-min-size')).style.getPropertyValue('--control-min-size'));
  const controlTouch=parseFloat(base.find(rule=>rule.style?.getPropertyValue('--control-touch-size')).style.getPropertyValue('--control-touch-size'));
  assert.equal(controlTouch,44,'gain space from insets, never from touch targets');
  assert.equal(touchButton,44);
  assert.equal(findRule(research,'body[data-shell=dashboard] #evidence-view').getPropertyValue('grid-template-rows'),'auto minmax(0,1fr) auto');
  const rowRules=stylesheet(document,'editorial-ledgers.css');
  assert.equal(findRule(rowRules,'#evidence-view').getPropertyValue('--evidence-row-height'),'48px');
  assert.equal(findRule(rowRules,'#evidence-view','(max-width:640px)').getPropertyValue('--evidence-row-height'),'64px');
  for(const phone of [false,true]) {
    const workspaceSelector='body[data-shell=dashboard] .workspace,\nbody[data-shell=dashboard] #root > .workspace';
    const workspace=phone?findRule(shell,'body[data-shell=dashboard] .workspace,\n  body[data-shell=dashboard] #root > .workspace','(max-width:767px)'):findRule(shell,workspaceSelector);
    const outerGap=parseFloat(workspace.getPropertyValue(phone?'padding-block':'padding'));
    const notice=(phone?touchButton:normalButton)+8+1;
    const controls=(phone?controlTouch:controlMin)+8;
    // This arithmetic describes the authored normal single-row controls and
    // status row, not a native measurement or a claim about font wrapping.
    const available=900-header-(2*outerGap+footer)-notice-(2*cardInset+2)-controls-pager-2*gap;
    assert.ok(available>=550,`${phone?'phone':'desktop'} source table allocation ${available}px must retain space above the unchanged 540px gate`);
  }
});
